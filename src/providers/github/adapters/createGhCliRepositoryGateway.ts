import { spawn } from 'node:child_process';

import type { RepositoryManifest } from '@ankhorage/contracts/repository';

import type { ProjectSnapshot } from '../../../connection/definitions/ProjectSnapshot.js';
import { getProjectSnapshotPaths } from '../../../connection/utils/getProjectSnapshotPaths.js';
import type {
  GitHubBootstrap,
  GitHubPublishedSnapshot,
  GitHubRemoteRepository,
  GitHubRepositoryGateway,
  GitHubRepositoryTarget,
} from '../ports/GitHubRepositoryGateway.js';
import {
  getGhNestedSha,
  type GhJsonRunner,
  isGhNotFound,
  isRecord,
  isString,
  runGhJsonAsync,
  sanitizeGhError,
  tryGhJsonAsync,
} from './ghCliJson.js';

interface GhResult {
  readonly stdout: string;
  readonly stderr: string;
}

interface GhRunner extends GhJsonRunner {
  runAsync(args: readonly string[], input?: string): Promise<GhResult>;
}

const bootstrapBranch = 'ankh-bootstrap' as const;
const bootstrapMarker = 'ankhorage bootstrap marker';

/** Create the GitHub gateway backed exclusively by the local `gh` executable. */
export function createGhCliRepositoryGateway(
  runner: GhRunner = createGhRunner(),
): GitHubRepositoryGateway {
  return {
    assertAvailableAsync: () => runner.runAsync(['--version']).then(() => undefined),
    assertAuthenticatedAsync: () => runner.runAsync(['auth', 'status']).then(() => undefined),
    getAuthenticatedOwnerAsync: async () => {
      const value = await runGhJsonAsync(runner, ['api', 'user']);
      if (!isRecord(value) || typeof value.login !== 'string' || value.login.length === 0) {
        throw new Error('GitHub returned an invalid authenticated user.');
      }
      return value.login;
    },
    inspectRepositoryAsync: (target) => inspectRepositoryAsync(runner, target),
    createRepositoryAsync: async (target) => {
      await runner.runAsync([
        'repo',
        'create',
        `${target.owner}/${target.name}`,
        `--${target.visibility}`,
      ]);
    },
    initializeBootstrapAsync: (target) => initializeBootstrapAsync(runner, target),
    publishSnapshotAsync: (target, snapshot, parentCommitSha) =>
      publishSnapshotAsync(runner, target, snapshot, parentCommitSha),
    verifyPublishedSnapshotAsync: (target, snapshot, commitSha) =>
      verifyPublishedSnapshotAsync(runner, target, snapshot, commitSha),
    setDefaultBranchAsync: async (target) => {
      await runner.runAsync(
        ['api', `repos/${target.owner}/${target.name}`, '--method', 'PATCH', '--input', '-'],
        JSON.stringify({ default_branch: target.defaultBranch }),
      );
    },
    deleteBootstrapAsync: async (target, bootstrap) => {
      const ref = `repos/${target.owner}/${target.name}/git/refs/heads/${bootstrap.branch}`;
      const current = await runGhJsonAsync(runner, ['api', ref]);
      if (
        !isRecord(current) ||
        !isRecord(current.object) ||
        current.object.sha !== bootstrap.commitSha
      ) {
        throw new Error('Bootstrap reference changed before cleanup.');
      }
      await runner.runAsync(['api', ref, '--method', 'DELETE']);
    },
  };
}

/** Spawn `gh` without a shell and with prompts, paging, and color disabled. */
function createGhRunner(): GhRunner {
  return {
    runAsync: (args, input) =>
      new Promise((resolve, reject) => {
        assertSafeArguments(args);
        const child = spawn('gh', args, {
          env: {
            ...process.env,
            GH_PROMPT_DISABLED: '1',
            GH_PAGER: 'cat',
            NO_COLOR: '1',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        child.once('error', reject);
        child.once('close', (code) => {
          if (code === 0) {
            resolve({ stdout, stderr });
          } else {
            reject(
              new Error(`gh command failed (${code ?? 'unknown'}): ${sanitizeGhError(stderr)}`),
            );
          }
        });
        if (input !== undefined) child.stdin.end(input);
        else child.stdin.end();
      }),
  };
}

/** Reject command arguments that could accidentally invoke local Git workflows. */
function assertSafeArguments(args: readonly string[]): void {
  const forbidden = new Set(['git', '--source', '--push', '--clone']);
  if (args.some((argument) => forbidden.has(argument))) {
    throw new Error('Unsafe gh arguments rejected.');
  }
}

/** Inspect repository metadata and the two operation-specific refs. */
async function inspectRepositoryAsync(
  runner: GhRunner,
  target: GitHubRepositoryTarget,
): Promise<GitHubRemoteRepository> {
  const prefix = `repos/${target.owner}/${target.name}`;
  let repository: unknown;
  try {
    repository = await runGhJsonAsync(runner, ['api', prefix]);
  } catch (error) {
    if (isGhNotFound(error)) {
      return {
        exists: false,
        owner: target.owner,
        name: target.name,
        url: target.url,
      };
    }
    throw error;
  }
  if (!isRecord(repository)) throw new Error('GitHub returned invalid repository metadata.');
  const mainRef = await tryGhJsonAsync(runner, ['api', `${prefix}/git/ref/heads/main`]);
  const bootstrapRef = await tryGhJsonAsync(runner, [
    'api',
    `${prefix}/git/ref/heads/${bootstrapBranch}`,
  ]);
  const mainCommitSha = getGhNestedSha(mainRef);
  const bootstrapCommitSha = getGhNestedSha(bootstrapRef);
  const mainManifest = mainCommitSha
    ? await readRemoteRepositoryManifestAsync(runner, prefix, mainCommitSha)
    : undefined;
  const bootstrapMarkerValue = bootstrapCommitSha
    ? await readRemoteTextFileAsync(runner, prefix, '.ankhorage-bootstrap', bootstrapBranch)
    : undefined;
  return {
    exists: true,
    owner: target.owner,
    name: target.name,
    url: typeof repository.html_url === 'string' ? repository.html_url : target.url,
    visibility: repository.private === true ? 'private' : 'public',
    defaultBranch:
      typeof repository.default_branch === 'string' ? repository.default_branch : undefined,
    mainCommitSha,
    mainManifest,
    bootstrapCommitSha,
    bootstrapMarker: bootstrapMarkerValue,
  };
}

/** Create the internal bootstrap commit through the contents endpoint. */
async function initializeBootstrapAsync(
  runner: GhRunner,
  target: GitHubRepositoryTarget,
): Promise<GitHubBootstrap> {
  const prefix = `repos/${target.owner}/${target.name}`;
  await runner.runAsync(
    ['api', `${prefix}/contents/.ankhorage-bootstrap`, '--method', 'PUT', '--input', '-'],
    JSON.stringify({
      message: '[skip eas] chore: initialize repository',
      content: Buffer.from(bootstrapMarker, 'utf8').toString('base64'),
      branch: bootstrapBranch,
    }),
  );
  const ref = await runGhJsonAsync(runner, ['api', `${prefix}/git/ref/heads/${bootstrapBranch}`]);
  const commitSha = getGhNestedSha(ref);
  if (!commitSha) throw new Error('GitHub did not return the bootstrap commit.');
  return { branch: bootstrapBranch, commitSha };
}

/** Upload blobs, create one complete tree and commit, then create `main` once. */
async function publishSnapshotAsync(
  runner: GhRunner,
  target: GitHubRepositoryTarget,
  snapshot: ProjectSnapshot,
  parentCommitSha: string,
): Promise<GitHubPublishedSnapshot> {
  const prefix = `repos/${target.owner}/${target.name}`;
  const blobs = await Promise.all(
    snapshot.entries.map(async (entry) => {
      const body = {
        content:
          entry.encoding === 'base64'
            ? entry.content
            : Buffer.from(entry.content, 'utf8').toString('base64'),
        encoding: 'base64',
      };
      const response = await runGhJsonAsync(
        runner,
        ['api', `${prefix}/git/blobs`, '--method', 'POST', '--input', '-'],
        JSON.stringify(body),
      );
      const sha = isRecord(response) && typeof response.sha === 'string' ? response.sha : undefined;
      if (!sha) throw new Error(`GitHub did not return a blob SHA for ${entry.path}.`);
      return { path: entry.path, mode: entry.mode, type: 'blob', sha };
    }),
  );
  const tree = await runGhJsonAsync(
    runner,
    ['api', `${prefix}/git/trees`, '--method', 'POST', '--input', '-'],
    JSON.stringify({ tree: blobs }),
  );
  const treeSha = isRecord(tree) && typeof tree.sha === 'string' ? tree.sha : undefined;
  if (!treeSha) throw new Error('GitHub did not return a tree SHA.');
  const commit = await runGhJsonAsync(
    runner,
    ['api', `${prefix}/git/commits`, '--method', 'POST', '--input', '-'],
    JSON.stringify({
      message: 'chore: initialize standalone app',
      tree: treeSha,
      parents: [parentCommitSha],
    }),
  );
  const commitSha = isRecord(commit) && typeof commit.sha === 'string' ? commit.sha : undefined;
  if (!commitSha) throw new Error('GitHub did not return an app commit SHA.');
  await runner.runAsync(
    ['api', `${prefix}/git/refs`, '--method', 'POST', '--input', '-'],
    JSON.stringify({ ref: 'refs/heads/main', sha: commitSha }),
  );
  return { commitSha };
}

/** Verify the final commit tree and canonical manifest before cleanup. */
async function verifyPublishedSnapshotAsync(
  runner: GhRunner,
  target: GitHubRepositoryTarget,
  snapshot: ProjectSnapshot,
  commitSha: string,
): Promise<void> {
  const prefix = `repos/${target.owner}/${target.name}`;
  const ref = await runGhJsonAsync(runner, ['api', `${prefix}/git/ref/heads/main`]);
  if (getGhNestedSha(ref) !== commitSha)
    throw new Error('Published main ref does not match the app commit.');
  const repository = await readRemoteRepositoryManifestAsync(runner, prefix, commitSha);
  if (JSON.stringify(repository) !== JSON.stringify(snapshot.repository)) {
    throw new Error('Published repository manifest does not match the prospective manifest.');
  }
  const tree = await runGhJsonAsync(runner, [
    'api',
    `${prefix}/git/trees/${commitSha}?recursive=1`,
  ]);
  const paths =
    isRecord(tree) && Array.isArray(tree.tree)
      ? tree.tree
          .filter(isRecord)
          .filter((entry) => entry.type === 'blob')
          .map((entry) => entry.path)
          .filter(isString)
      : [];
  const expected = getProjectSnapshotPaths(snapshot.entries);
  if (JSON.stringify(paths.sort()) !== JSON.stringify(expected)) {
    throw new Error('Published tree does not match the complete project snapshot.');
  }
}

/** Read the remote repository manifest from a commit. */
async function readRemoteRepositoryManifestAsync(
  runner: GhRunner,
  prefix: string,
  ref: string,
): Promise<RepositoryManifest | undefined> {
  const value = await tryGhJsonAsync(runner, [
    'api',
    `${prefix}/contents/.ankhorage/repository.json?ref=${ref}`,
  ]);
  if (!isRecord(value) || typeof value.content !== 'string') return undefined;
  try {
    return JSON.parse(
      Buffer.from(value.content.replaceAll('\n', ''), 'base64').toString('utf8'),
    ) as RepositoryManifest;
  } catch {
    return undefined;
  }
}

/** Read a text marker from an exact branch. */
async function readRemoteTextFileAsync(
  runner: GhRunner,
  prefix: string,
  path: string,
  ref: string,
): Promise<string | undefined> {
  const value = await tryGhJsonAsync(runner, ['api', `${prefix}/contents/${path}?ref=${ref}`]);
  if (!isRecord(value) || typeof value.content !== 'string') return undefined;
  return Buffer.from(value.content.replaceAll('\n', ''), 'base64').toString('utf8');
}
