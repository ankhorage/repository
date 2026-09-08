import type { RepositoryManifest } from '@ankhorage/contracts/repository';
import { expect, test } from 'bun:test';

import type { ProjectSnapshot } from '../../../connection/definitions/ProjectSnapshot.js';
import type { GitHubRepositoryConnectionDependencies } from '../definitions/GitHubRepositoryConnectionOptions.js';
import type { GitHubRepositoryGateway } from '../ports/GitHubRepositoryGateway.js';
import { connectGitHubRepositoryAsync } from './connectGitHubRepositoryAsync.js';

const repository: RepositoryManifest = {
  provider: 'github',
  owner: 'ankhorage',
  name: 'ankh-demo',
  url: 'https://github.com/ankhorage/ankh-demo',
  defaultBranch: 'main',
};

const snapshot: ProjectSnapshot = {
  projectPath: '/workspace/apps/demo',
  repository,
  entries: [],
};

test('sets main as default before cleaning bootstrap during partial-publish resume', async () => {
  const calls: string[] = [];

  const result = await connectGitHubRepositoryAsync(
    { projectPath: snapshot.projectPath, name: repository.name, visibility: 'private' },
    createExistingConnectionDependencies(calls),
  );

  expect(result).toEqual({
    status: 'already-connected',
    repository: {
      owner: repository.owner,
      name: repository.name,
      url: repository.url,
      defaultBranch: 'main',
    },
    appCommitSha: 'app-commit',
  });
  expect(calls).toEqual(['set-default', 'delete-bootstrap']);
});

function createExistingConnectionDependencies(
  calls: string[],
): GitHubRepositoryConnectionDependencies {
  return {
    gateway: createExistingGateway(calls),
    snapshotReader: { readAsync: () => Promise.resolve(snapshot) },
    manifestStore: {
      readConfigAsync: () => Promise.resolve(repository),
      updateRepositoryAsync: () =>
        Promise.reject(new Error('Should not rewrite an existing manifest.')),
    },
  };
}

function createExistingGateway(calls: string[]): GitHubRepositoryGateway {
  return {
    assertAvailableAsync: () => Promise.resolve(),
    assertAuthenticatedAsync: () => Promise.resolve(),
    getAuthenticatedOwnerAsync: () => Promise.resolve(repository.owner),
    inspectRepositoryAsync: () =>
      Promise.resolve({
        exists: true,
        owner: repository.owner,
        name: repository.name,
        url: repository.url,
        visibility: 'private',
        defaultBranch: 'ankh-bootstrap',
        mainCommitSha: 'app-commit',
        mainManifest: repository,
        bootstrapCommitSha: 'bootstrap-commit',
        bootstrapMarker: 'ankhorage bootstrap marker',
      }),
    createRepositoryAsync: () =>
      Promise.reject(new Error('Should not create an existing repository.')),
    initializeBootstrapAsync: () =>
      Promise.reject(new Error('Should not initialize an existing bootstrap.')),
    publishSnapshotAsync: () =>
      Promise.reject(new Error('Should not republish an existing app commit.')),
    verifyPublishedSnapshotAsync: () =>
      Promise.reject(new Error('Should not reverify an existing app commit.')),
    setDefaultBranchAsync: () => {
      calls.push('set-default');
      return Promise.resolve();
    },
    deleteBootstrapAsync: () => {
      calls.push('delete-bootstrap');
      return Promise.resolve();
    },
  };
}
