import type { RepositoryManifest } from '@ankhorage/contracts/repository';
import { expect, test } from 'bun:test';

import type { ProjectSnapshot } from '../../../connection/definitions/ProjectSnapshot.js';
import type { GitHubRepositoryTarget } from '../ports/GitHubRepositoryGateway.js';
import { createGhCliRepositoryGateway } from './createGhCliRepositoryGateway.js';

const repository: RepositoryManifest = {
  provider: 'github',
  owner: 'ankhorage',
  name: 'ankh-demo',
  url: 'https://github.com/ankhorage/ankh-demo',
  defaultBranch: 'main',
};

const target: GitHubRepositoryTarget = {
  ...repository,
  visibility: 'private',
};

const snapshot: ProjectSnapshot = {
  projectPath: '/workspace/apps/demo',
  repository,
  entries: [
    {
      path: '.ankhorage/repository.json',
      mode: '100644',
      content: `${JSON.stringify(repository)}\n`,
      encoding: 'utf-8',
    },
    {
      path: 'src/index.ts',
      mode: '100644',
      content: 'export {};\n',
      encoding: 'utf-8',
    },
  ],
};

test('publishes a complete snapshot tree without inheriting bootstrap files', async () => {
  const calls: { readonly args: readonly string[]; readonly input?: string }[] = [];
  let blobIndex = 0;
  const gateway = createGhCliRepositoryGateway({
    runAsync: async (args, input) => {
      await Promise.resolve();
      calls.push({ args, input });
      const endpoint = args[1] ?? '';
      if (endpoint.endsWith('/git/blobs')) {
        blobIndex += 1;
        return { stdout: JSON.stringify({ sha: `blob-${blobIndex}` }), stderr: '' };
      }
      if (endpoint.endsWith('/git/trees')) {
        return { stdout: JSON.stringify({ sha: 'tree-sha' }), stderr: '' };
      }
      if (endpoint.endsWith('/git/commits')) {
        return { stdout: JSON.stringify({ sha: 'commit-sha' }), stderr: '' };
      }
      return { stdout: '{}', stderr: '' };
    },
  });

  const published = await gateway.publishSnapshotAsync(target, snapshot, 'bootstrap-commit-sha');

  expect(published).toEqual({ commitSha: 'commit-sha' });

  const treeCall = calls.find(({ args }) => args[1]?.endsWith('/git/trees'));
  expect(treeCall).toBeDefined();
  expect(JSON.parse(treeCall?.input ?? '')).toEqual({
    tree: [
      {
        path: '.ankhorage/repository.json',
        mode: '100644',
        type: 'blob',
        sha: 'blob-1',
      },
      { path: 'src/index.ts', mode: '100644', type: 'blob', sha: 'blob-2' },
    ],
  });
});

test('verifies snapshot files while ignoring recursive tree directory entries', async () => {
  const gateway = createVerificationGateway([
    { path: '.ankhorage', mode: '040000', type: 'tree', sha: 'directory-1' },
    {
      path: '.ankhorage/repository.json',
      mode: '100644',
      type: 'blob',
      sha: 'blob-1',
    },
    { path: 'src', mode: '040000', type: 'tree', sha: 'directory-2' },
    { path: 'src/index.ts', mode: '100644', type: 'blob', sha: 'blob-2' },
  ]);

  const result = await gateway.verifyPublishedSnapshotAsync(target, snapshot, 'commit-sha');

  expect(result).toBeUndefined();
});

test('rejects an unexpected bootstrap blob in the published snapshot', async () => {
  const gateway = createVerificationGateway([
    {
      path: '.ankhorage/repository.json',
      mode: '100644',
      type: 'blob',
      sha: 'blob-1',
    },
    { path: '.ankhorage-bootstrap', mode: '100644', type: 'blob', sha: 'bootstrap-blob' },
    { path: 'src/index.ts', mode: '100644', type: 'blob', sha: 'blob-2' },
  ]);

  let rejection: unknown;
  try {
    await gateway.verifyPublishedSnapshotAsync(target, snapshot, 'commit-sha');
  } catch (error) {
    rejection = error;
  }

  expect(rejection).toBeInstanceOf(Error);
  expect((rejection as Error).message).toBe(
    'Published tree does not match the complete project snapshot.',
  );
});

function createVerificationGateway(tree: readonly Record<string, unknown>[]) {
  return createGhCliRepositoryGateway({
    runAsync: async (args) => {
      await Promise.resolve();
      const endpoint = args[1] ?? '';
      if (endpoint.endsWith('/git/ref/heads/main')) {
        return {
          stdout: JSON.stringify({ object: { sha: 'commit-sha' } }),
          stderr: '',
        };
      }
      if (endpoint.includes('/contents/.ankhorage/repository.json')) {
        return {
          stdout: JSON.stringify({
            content: Buffer.from(JSON.stringify(repository), 'utf8').toString('base64'),
          }),
          stderr: '',
        };
      }
      if (endpoint.includes('/git/trees/commit-sha?recursive=1')) {
        return { stdout: JSON.stringify({ tree }), stderr: '' };
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  });
}
