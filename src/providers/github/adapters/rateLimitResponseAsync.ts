/*** Classify GitHub primary, secondary, and Retry-After rate-limit responses. */
export async function rateLimitResponseAsync(
  response: Response,
  now: () => number,
  readMessageAsync: ReadGitHubErrorMessageAsync,
): Promise<GitHubRateLimitResponse> {
  const retryAfterMilliseconds = readRetryAfterMilliseconds(response);
  if (response.status !== 403 && response.status !== 429) return { isRateLimited: false };
  const primaryRateLimitExceeded = response.headers.get('x-ratelimit-remaining') === '0';
  if (primaryRateLimitExceeded) {
    return {
      isRateLimited: true,
      retryAfterMilliseconds: laterRateLimitDeadlineMilliseconds(
        readResetDelayMilliseconds(response, now),
        retryAfterMilliseconds,
      ),
    };
  }
  if (response.status === 429) return { isRateLimited: true, retryAfterMilliseconds };
  if (retryAfterMilliseconds !== undefined) return { isRateLimited: true, retryAfterMilliseconds };
  const message = await readMessageAsync(response);
  return { isRateLimited: message !== undefined && /\bsecondary rate limit\b/iu.test(message) };
}

export interface GitHubRateLimitResponse {
  readonly isRateLimited: boolean;
  readonly retryAfterMilliseconds?: number;
}

type ReadGitHubErrorMessageAsync = (response: Response) => Promise<string | undefined>;

/*** Keep every provider-required rate-limit deadline by selecting the later valid delay. */
function laterRateLimitDeadlineMilliseconds(
  primaryResetDelayMilliseconds: number | undefined,
  retryAfterMilliseconds: number | undefined,
): number | undefined {
  if (primaryResetDelayMilliseconds === undefined) return retryAfterMilliseconds;
  if (retryAfterMilliseconds === undefined) return primaryResetDelayMilliseconds;
  return Math.max(primaryResetDelayMilliseconds, retryAfterMilliseconds);
}

/*** Read a syntactically valid non-negative Retry-After delay without discarding provider timing. */
function readRetryAfterMilliseconds(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (!value || !/^\d+(?:\.\d+)?$/u.test(value)) return undefined;
  const milliseconds = Number(value) * 1000;
  return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
}

/*** Read a valid primary-rate-limit reset timestamp without discarding a delay beyond the retry budget. */
function readResetDelayMilliseconds(response: Response, now: () => number): number | undefined {
  const value = response.headers.get('x-ratelimit-reset');
  if (!value || !/^\d+$/u.test(value)) return undefined;
  const milliseconds = Number(value) * 1000 - now();
  return Number.isSafeInteger(milliseconds) && milliseconds >= 0 ? milliseconds : undefined;
}
