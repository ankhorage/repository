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
  await expect(access(result.rootPath)).rejects.toThrow();
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

  await expect(
    materializeGitHubRepositoryWithGatewayAsync(
      { url: 'https://github.com/ankhorage/demo' },
      gateway,
    ),
  ).rejects.toThrow('Unsafe GitHub repository path');
  expect(reads).toBe(0);
});

test('rejects truncated GitHub trees before materialization', async () => {
  const gateway = createGateway({ files: {}, truncated: true });

  await expect(
    materializeGitHubRepositoryWithGatewayAsync(
      { url: 'https://github.com/ankhorage/demo' },
      gateway,
    ),
  ).rejects.toThrow('repository tree is truncated');
});

test('rejects unsafe symbolic links rather than following provider paths', async () => {
  const gateway: GitHubRepositoryReadGateway = {
    ...createGateway({ files: {} }),
    readTreeAsync: async () => ({
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

  await expect(
    materializeGitHubRepositoryWithGatewayAsync(
      { url: 'https://github.com/ankhorage/demo' },
      gateway,
    ),
  ).rejects.toThrow('symbolic links are not supported');
});

function createGateway(options: {
  readonly files: Readonly<Record<string, string>>;
  readonly requestedRefs?: string[];
  readonly defaultBranch?: string;
  readonly truncated?: boolean;
  readonly onRead?: () => void;
}): GitHubRepositoryReadGateway {
  const entries = Object.entries(options.files).map(([path, content], index) => ({
    mode: '100644',
    path,
    sha: `blob-${index}`,
    size: Buffer.byteLength(content),
    type: 'blob' as const,
  }));
  return {
    inspectRepositoryAsync: async target => ({
      defaultBranch: options.defaultBranch ?? 'main',
      url: target.url,
    }),
    resolveRevisionAsync: async (_target, ref) => {
      options.requestedRefs?.push(ref);
      return { commitSha: 'commit-sha', treeSha: 'tree-sha' };
    },
    readTreeAsync: async () => ({
      entries,
      truncated: options.truncated ?? false,
    }),
    readFileAsync: async (_target, _revision, path) => {
      options.onRead?.();
      const content = options.files[path];
      if (content === undefined) throw new Error(`Missing fixture: ${path}`);
      return Buffer.from(content);
    },
  };
}
