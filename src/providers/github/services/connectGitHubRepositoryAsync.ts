import { createLocalProjectSnapshotReader } from '../../../connection/adapters/createLocalProjectSnapshotReader.js';
import { createLocalRepositoryManifestStore } from '../../../connection/adapters/createLocalRepositoryManifestStore.js';
import type { ProjectSnapshot } from '../../../connection/definitions/ProjectSnapshot.js';
import type { RepositoryManifestStore } from '../../../connection/ports/RepositoryManifestStore.js';
import { createGhCliRepositoryGateway } from '../adapters/createGhCliRepositoryGateway.js';
import type {
  GitHubRepositoryConnectionDependencies,
  GitHubRepositoryConnectionOptions,
} from '../definitions/GitHubRepositoryConnectionOptions.js';
import type {
  GitHubRepositoryConnectionFailure,
  GitHubRepositoryConnectionIdentity,
  GitHubRepositoryConnectionResult,
} from '../definitions/GitHubRepositoryConnectionResult.js';
import type {
  GitHubRemoteRepository,
  GitHubRepositoryGateway,
  GitHubRepositoryTarget,
} from '../ports/GitHubRepositoryGateway.js';
import {
  inspectGitHubRepositoryPreflightAsync,
  PreflightError,
} from './inspectGitHubRepositoryPreflightAsync.js';
import { publishGitHubProjectSnapshotAsync } from './publishGitHubProjectSnapshotAsync.js';

/** Connect a standalone app to GitHub and publish its complete snapshot on `main`. */
export async function connectGitHubRepositoryAsync(
  options: GitHubRepositoryConnectionOptions = {},
  dependencies: GitHubRepositoryConnectionDependencies = {},
): Promise<GitHubRepositoryConnectionResult> {
  const gateway = dependencies.gateway ?? createGhCliRepositoryGateway();
  const snapshotReader = dependencies.snapshotReader ?? createLocalProjectSnapshotReader();
  const manifestStore = dependencies.manifestStore ?? createLocalRepositoryManifestStore();
  let preflight;
  try {
    preflight = await inspectGitHubRepositoryPreflightAsync(
      options,
      gateway,
      snapshotReader,
      manifestStore,
    );
  } catch (error) {
    return toFailure(error, 'preflight');
  }
  const { target, identity, remote, snapshot } = preflight;
  const existing = await finishAlreadyConnectedAsync(gateway, target, identity, remote);
  if (existing) return existing;
  try {
    return await publishConnectionAsync(
      gateway,
      manifestStore,
      options.projectPath ?? process.cwd(),
      target,
      identity,
      remote,
      snapshot,
    );
  } catch (error) {
    return toFailure(error, 'publish', identity);
  }
}

/** Finish an idempotent connection and clean up its recognized bootstrap ref. */
async function finishAlreadyConnectedAsync(
  gateway: GitHubRepositoryGateway,
  target: GitHubRepositoryTarget,
  identity: GitHubRepositoryConnectionIdentity,
  remote: GitHubRemoteRepository,
): Promise<GitHubRepositoryConnectionResult | undefined> {
  if (
    !remote.mainManifest ||
    !remote.mainCommitSha ||
    remote.mainManifest.owner !== identity.owner ||
    remote.mainManifest.name !== identity.name
  ) {
    return undefined;
  }
  if (remote.bootstrapCommitSha) {
    await gateway.setDefaultBranchAsync(target);
    await gateway.deleteBootstrapAsync(target, {
      branch: 'ankh-bootstrap',
      commitSha: remote.bootstrapCommitSha,
    });
  }
  return {
    status: 'already-connected',
    repository: identity,
    appCommitSha: remote.mainCommitSha,
  };
}

/** Persist the connection and publish the complete snapshot. */
async function publishConnectionAsync(
  gateway: GitHubRepositoryGateway,
  manifestStore: RepositoryManifestStore,
  projectPath: string,
  target: GitHubRepositoryTarget,
  identity: GitHubRepositoryConnectionIdentity,
  remote: GitHubRemoteRepository,
  snapshot: ProjectSnapshot,
): Promise<GitHubRepositoryConnectionResult> {
  await manifestStore.updateRepositoryAsync(projectPath, { provider: 'github', ...identity });
  if (!remote.exists) await gateway.createRepositoryAsync(target);
  const publication = await publishGitHubProjectSnapshotAsync(
    gateway,
    target,
    snapshot,
    remote.bootstrapCommitSha,
  );
  return { status: 'connected', repository: identity, appCommitSha: publication.commitSha };
}

/** Convert provider and validation errors into a stable public failure result. */
function toFailure(
  error: unknown,
  stage: string,
  repository?: { owner: string; name: string; url: string; defaultBranch: 'main' },
): GitHubRepositoryConnectionFailure {
  if (error instanceof PreflightError && error.kind === 'conflict') {
    return { status: 'conflict', stage, code: error.code, message: error.message, repository };
  }
  return {
    status: 'recoverable-failure',
    stage,
    code: error instanceof PreflightError ? error.code : 'operation-failed',
    message: error instanceof Error ? error.message : 'GitHub connection failed.',
    repository,
  };
}
