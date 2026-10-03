import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import type { GitHubRepositoryReadGateway } from '../ports/GitHubRepositoryReadGateway.js';
import { materializeGitHubRepositoryWithGatewayAsync } from './materializeGitHubRepositoryWithGatewayAsync.js';

test('materializes an exact GitHub revision and cleans up the isolated root', async () => {
  const requestedRefs: string[] = [];
  const gateway = createGateway({
    requestedRefs,
    files: {
      'package.json': '{"name":"demo"}\n',
      'src/index.ts': 'export const demo = true;\n',
    },
  });

  const result = await materializeGitHubRepositoryWithGatewayAsync(
    { url: 'https://github.com/ankhorage/demo', ref: 'feature/read' },
    gateway,
  );

  expect(requestedRefs).toEqual(['feature/read']);
  expect(result.revision).toBe('commit-sha');
  expect(result.repository).toEqual({
    owner: 'ankhorage',
    name: 'demo',
    url: 'https://github.com/ankhorage/demo',
    defaultBranch: 'main',
  });
  expect(await readFile(join(result.rootPath, 'src/index.ts'), 'utf8')).toBe(
    'export const demo = true;\n',
  );

  await result.cleanupAsync();
  await expectMissingPathAsync(result.rootPath);
});

test('uses the remote default branch when no ref is supplied', async () => {
  const requestedRefs: string[] = [];
  const result = await materializeGitHubRepositoryWithGatewayAsync(
    { url: 'https://github.com/ankhorage/demo.git' },
    createGateway({ requestedRefs, defaultBranch: 'develop', files: {} }),
  );

  expect(requestedRefs).toEqual(['develop']);
  await result.cleanupAsync();
});

test('rejects traversal before downloading an unsafe repository file', async () => {
  let reads = 0;
  const gateway = createGateway({
    files: { '../escape.ts': 'escape' },
    onRead: () => {
      reads += 1;
    },
  });

  await expectFailureAsync(
    () =>
      materializeGitHubRepositoryWithGatewayAsync(
        { url: 'https://github.com/ankhorage/demo' },
        gateway,
      ),
    'Unsafe GitHub repository path',
  );
  expect(reads).toBe(0);
});

test('rejects truncated GitHub trees before materialization', async () => {
  const gateway = createGateway({ files: {}, truncated: true });

  await expectFailureAsync(
    () =>
      materializeGitHubRepositoryWithGatewayAsync(
        { url: 'https://github.com/ankhorage/demo' },
        gateway,
      ),
    'repository tree is truncated',
  );
});

test('rejects unsafe symbolic links rather than following provider paths', async () => {
  const gateway: GitHubRepositoryReadGateway = {
    ...createGateway({ files: {} }),
    readTreeAsync: () =>
      Promise.resolve({
        truncated: false,
        entries: [
          {
            mode: '120000',
            path: 'outside',
            sha: 'link-sha',
            size: 10,
            type: 'blob',
          },
        ],
      }),
  };

  await expectFailureAsync(
    () =>
      materializeGitHubRepositoryWithGatewayAsync(
        { url: 'https://github.com/ankhorage/demo' },
        gateway,
      ),
    'symbolic links are not supported',
  );
});

function createGateway(options: {
  readonly files: Readonly<Record<string, string>>;
  readonly requestedRefs?: string[];
  readonly defaultBranch?: string;
  readonly truncated?: boolean;
  readonly onRead?: () => void;
}): GitHubRepositoryReadGateway {
  const files = new Map(Object.entries(options.files));
  const entries = [...files].map(([path, fileContent], index) => ({
    mode: '100644',
    path,
    sha: `blob-${index}`,
    size: Buffer.byteLength(fileContent),
    type: 'blob' as const,
  }));
  return {
    inspectRepositoryAsync: (target) =>
      Promise.resolve({
        defaultBranch: options.defaultBranch ?? 'main',
        url: target.url,
      }),
    resolveRevisionAsync: (_target, ref) => {
      options.requestedRefs?.push(ref);
      return Promise.resolve({ commitSha: 'commit-sha', treeSha: 'tree-sha' });
    },
    readTreeAsync: () =>
      Promise.resolve({
        entries,
        truncated: options.truncated ?? false,
      }),
    readFileAsync: (_target, _revision, path) => {
      options.onRead?.();
      const fileContent = files.get(path);
      if (fileContent === undefined) throw new Error(`Missing fixture: ${path}`);
      return Promise.resolve(Buffer.from(fileContent));
    },
  };
}

async function expectFailureAsync(
  operation: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await operation();
    throw new Error('Expected operation to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(message);
  }
}

async function expectMissingPathAsync(path: string): Promise<void> {
  try {
    await access(path);
    throw new Error('Expected path to be missing.');
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
  }
}
