import type { GitHubRepositoryAuthentication } from '../definitions/GitHubRepositoryDiscoveryOptions.js';
import { GitHubRepositoryDiscoveryError } from '../definitions/GitHubRepositoryDiscoveryResult.js';
import { type GitHubRateLimitResponse, rateLimitResponseAsync } from './rateLimitResponseAsync.js';

const REQUEST_TIMEOUT_MILLISECONDS = 30_000;
const MAX_REQUEST_ATTEMPTS = 3;
const MAX_RETRY_WAIT_MILLISECONDS = 60_000;
const MAX_RETRY_DELAY_MILLISECONDS = 30_000;

export interface GitHubHttpClient {
  requestBytesAsync(url: string, subject: string, signal?: AbortSignal): Promise<Uint8Array>;
  requestJsonResponseAsync(
    url: string,
    subject: string,
    signal?: AbortSignal,
  ): Promise<{ readonly value: unknown; readonly link: string | null }>;
}

export interface GitHubHttpClientOptions {
  readonly authentication?: GitHubRepositoryAuthentication;
  readonly now?: () => number;
  readonly timeoutMilliseconds?: number;
  readonly waitAsync?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

/*** Create the canonical credential-safe GitHub HTTP client for repository provider adapters. */
export function createGitHubHttpClient(
  fetcher: typeof fetch = fetch,
  options: GitHubHttpClientOptions = {},
): GitHubHttpClient {
  const configuration = {
    authentication: options.authentication ?? 'environment',
    now: options.now ?? Date.now,
    timeoutMilliseconds: options.timeoutMilliseconds ?? REQUEST_TIMEOUT_MILLISECONDS,
    waitAsync: options.waitAsync ?? waitForRetryAsync,
  } as const;
  return {
    requestBytesAsync: (url, subject, signal) =>
      requestWithRetriesAsync(fetcher, configuration, url, subject, signal, (response) =>
        response.arrayBuffer().then((value) => new Uint8Array(value)),
      ),
    requestJsonResponseAsync: (url, subject, signal) =>
      requestWithRetriesAsync(fetcher, configuration, url, subject, signal, async (response) => ({
        value: await response.json(),
        link: response.headers.get('link'),
      })),
  };
}

type ResponseReaderAsync<Value> = (response: Response) => Promise<Value>;

interface GitHubHttpClientConfiguration {
  readonly authentication: GitHubRepositoryAuthentication;
  readonly now: () => number;
  readonly timeoutMilliseconds: number;
  readonly waitAsync: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

/*** Execute one GitHub request with bounded retry time and cancellation across all request phases. */
async function requestWithRetriesAsync<Value>(
  fetcher: typeof fetch,
  configuration: GitHubHttpClientConfiguration,
  url: string,
  subject: string,
  signal: AbortSignal | undefined,
  readResponseAsync: ResponseReaderAsync<Value>,
): Promise<Value> {
  let waitedMilliseconds = 0;
  for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt += 1) {
    throwIfAborted(signal);
    const response = await fetchResponseAsync(fetcher, configuration, url, signal);
    if (response.ok) {
      try {
        return await readResponseWithDeadlineAsync(
          readResponseAsync,
          response,
          configuration,
          signal,
        );
      } catch (error) {
        if (isInterruptionError(error)) throw error;
        throw new GitHubRepositoryDiscoveryError('api-failure', 'GitHub returned malformed data.');
      }
    }
    const rateLimit = await rateLimitResponseAsync(response, configuration.now, (errorResponse) =>
      readResponseWithDeadlineAsync(
        readGitHubErrorMessageAsync,
        errorResponse,
        configuration,
        signal,
      ),
    );
    const failure = requestError(response, subject, rateLimit);
    const retryDelay = retryDelayMilliseconds(response, attempt, rateLimit);
    const canRetry =
      attempt < MAX_REQUEST_ATTEMPTS - 1 &&
      retryDelay !== undefined &&
      waitedMilliseconds + retryDelay <= MAX_RETRY_WAIT_MILLISECONDS;
    if (!canRetry) throw failure;
    await configuration.waitAsync(retryDelay, signal);
    throwIfAborted(signal);
    waitedMilliseconds += retryDelay;
  }
  throw new GitHubRepositoryDiscoveryError(
    'api-failure',
    'GitHub request retry limit was exceeded.',
  );
}

/*** Read a response body under the same bounded cancellation contract as the network request. */
async function readResponseWithDeadlineAsync<Value>(
  readResponseAsync: ResponseReaderAsync<Value>,
  response: Response,
  configuration: GitHubHttpClientConfiguration,
  signal: AbortSignal | undefined,
): Promise<Value> {
  const deadline = createDeadline(signal, configuration.timeoutMilliseconds);
  try {
    return await readWithCancellationAsync(readResponseAsync(response), deadline.signal);
  } catch (error) {
    if (signal?.aborted) throw cancelledError();
    if (deadline.timedOut()) throw timeoutError();
    throw error;
  } finally {
    deadline.dispose();
  }
}

/*** Fetch a GitHub response with a bounded deadline that remains distinguishable from caller cancellation. */
async function fetchResponseAsync(
  fetcher: typeof fetch,
  configuration: GitHubHttpClientConfiguration,
  url: string,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const deadline = createDeadline(signal, configuration.timeoutMilliseconds);
  try {
    return await readWithCancellationAsync(
      fetcher(url, {
        headers: requestHeaders(configuration.authentication),
        signal: deadline.signal,
      }),
      deadline.signal,
    );
  } catch (error) {
    if (signal?.aborted) throw cancelledError();
    if (deadline.timedOut()) throw timeoutError();
    if (error instanceof GitHubRepositoryDiscoveryError) throw error;
    if (isInterruptionError(error)) throw error;
    throw new GitHubRepositoryDiscoveryError('api-failure', 'GitHub request failed.');
  } finally {
    deadline.dispose();
  }
}

/*** Create a request-local signal and release its timer and caller listener after each request. */
function createDeadline(
  signal: AbortSignal | undefined,
  timeoutMilliseconds: number,
): {
  readonly dispose: () => void;
  readonly signal: AbortSignal;
  readonly timedOut: () => boolean;
} {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMilliseconds);
  return {
    dispose: () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    },
    signal: controller.signal,
    timedOut: () => timedOut,
  };
}

/*** Race a response operation against cancellation and always remove the temporary abort listener. */
function readWithCancellationAsync<Value>(
  value: Promise<Value>,
  signal: AbortSignal | undefined,
): Promise<Value> {
  if (!signal) return value;
  if (signal.aborted) return Promise.reject(cancelledError());
  return new Promise((resolve, reject) => {
    const abort = () => reject(cancelledError());
    signal.addEventListener('abort', abort, { once: true });
    value.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/*** Calculate a retry delay without replacing a provider-required rate-limit wait with backoff. */
function retryDelayMilliseconds(
  response: Response,
  attempt: number,
  rateLimit: GitHubRateLimitResponse,
): number | undefined {
  if (rateLimit.isRateLimited) return rateLimit.retryAfterMilliseconds;
  if (response.status === 429 || response.status >= 500)
    return Math.min(250 * 2 ** attempt, MAX_RETRY_DELAY_MILLISECONDS);
  return undefined;
}

/*** Read only GitHub's structured error message and treat absent or malformed bodies as unknown. */
async function readGitHubErrorMessageAsync(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) return undefined;
    const message: unknown = Reflect.get(body, 'message');
    return typeof message === 'string' ? message : undefined;
  } catch {
    return undefined;
  }
}

/*** Map provider failures to credential-free typed errors at the canonical adapter boundary. */
function requestError(
  response: Response,
  subject: string,
  rateLimit: GitHubRateLimitResponse,
): GitHubRepositoryDiscoveryError {
  if (rateLimit.isRateLimited) {
    return new GitHubRepositoryDiscoveryError(
      'rate-limited',
      'GitHub rate limit reached. Retry after the reported delay.',
      rateLimit.retryAfterMilliseconds,
    );
  }
  if (response.status === 404 && subject === 'owner') {
    return new GitHubRepositoryDiscoveryError('owner-not-found', 'GitHub owner was not found.');
  }
  if (response.status === 401 || response.status === 403) {
    return new GitHubRepositoryDiscoveryError(
      'permission-denied',
      'GitHub denied access to this resource.',
    );
  }
  return new GitHubRepositoryDiscoveryError(
    'api-failure',
    `GitHub ${subject} request failed with HTTP ${response.status}.`,
  );
}

/*** Wait for a retry while promptly cancelling the timer and removing its listener in every outcome. */
function waitForRetryAsync(milliseconds: number, signal: AbortSignal | undefined): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, milliseconds));
  if (signal.aborted) return Promise.reject(cancelledError());
  return new Promise((resolve, reject) => {
    const done = () => signal.removeEventListener('abort', abort);
    const abort = () => {
      clearTimeout(timeout);
      done();
      reject(cancelledError());
    };
    const timeout = setTimeout(() => {
      done();
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/*** Build GitHub request headers only from the caller's explicit authentication selection. */
function requestHeaders(
  authentication: GitHubRepositoryAuthentication,
): Readonly<Record<string, string>> {
  const token =
    authentication === 'environment'
      ? (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN)
      : typeof authentication === 'object'
        ? authentication.accessToken
        : undefined;
  if (typeof authentication === 'object' && !authentication.accessToken.trim())
    throw new GitHubRepositoryDiscoveryError(
      'permission-denied',
      'GitHub user authorization is unavailable.',
    );
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': '@ankhorage/repository',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/*** Identify a stable cancellation or timeout error created by this client. */
function isInterruptionError(error: unknown): boolean {
  return (
    error instanceof GitHubRepositoryDiscoveryError &&
    (error.code === 'cancelled' || error.code === 'timeout')
  );
}

/*** Construct the stable cancellation error returned from the GitHub adapter boundary. */
function cancelledError(): GitHubRepositoryDiscoveryError {
  return new GitHubRepositoryDiscoveryError(
    'cancelled',
    'GitHub repository operation was cancelled.',
  );
}

/*** Construct the stable timeout error without conflating it with an explicit caller cancellation. */
function timeoutError(): GitHubRepositoryDiscoveryError {
  return new GitHubRepositoryDiscoveryError('timeout', 'GitHub request timed out.');
}

/*** Stop before starting an adapter request when cancellation has already been requested. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw cancelledError();
}
