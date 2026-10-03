import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import type { GitHubRepositoryReadGateway } from '../ports/GitHubRepositoryReadGateway.js';
import { materializeGitHubRepositoryWithGatewayAsync } from './materializeGitHubRepositoryWithGatewayAsync.js';

test('materializes an exact explicit GitHub revision and cleans up the isolated root', async () => {
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
  expect(result.diagnostics).toEqual([]);
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

test('uses the remote default branch for a normal repository URL', async () => {
  const requestedRefs: string[] = [];
  const result = await materializeGitHubRepositoryWithGatewayAsync(
    { url: 'https://github.com/ankhorage/demo.git?tab=readme-ov-file#readme' },
    createGateway({ requestedRefs, defaultBranch: 'develop', files: {} }),
  );

  expect(requestedRefs).toEqual(['develop']);
  await result.cleanupAsync();
});

test('resolves slash-containing refs from normal GitHub tree URLs', async () => {
  const requestedRefs: string[] = [];
  const result = await materializeGitHubRepositoryWithGatewayAsync(
    { url: 'https://github.com/ankhorage/demo/tree/feature/read' },
    createGateway({
      requestedRefs,
      acceptedRefs: ['feature/read'],
      files: { 'src/index.ts': 'export {};\n' },
    }),
  );

  expect(requestedRefs).toEqual(['feature/read']);
  await result.cleanupAsync();
});

test('resolves a ref from normal GitHub blob URLs while ignoring the file path', async () => {
  const requestedRefs: string[] = [];
  const result = await materializeGitHubRepositoryWithGatewayAsync(
    { url: 'https://github.com/ankhorage/demo/blob/main/src/index.ts#L1' },
    createGateway({
      requestedRefs,
      acceptedRefs: ['main'],
      files: { 'src/index.ts': 'export {};\n' },
    }),
  );

  expect(requestedRefs).toEqual(['main/src/index.ts', 'main/src', 'main']);
  await result.cleanupAsync();
});

test('resolves normal GitHub commit URLs directly', async () => {
  const requestedRefs: string[] = [];
  const result = await materializeGitHubRepositoryWithGatewayAsync(
    { url: 'https://github.com/ankhorage/demo/commit/deadbeef' },
    createGateway({
      requestedRefs,
      acceptedRefs: ['deadbeef'],
      files: {},
    }),
  );

  expect(requestedRefs).toEqual(['deadbeef']);
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

test('skips symbolic links with warnings without reading their target bytes', async () => {
  const reads: string[] = [];
  const gateway: GitHubRepositoryReadGateway = {
    ...createGateway({
      files: { 'src/index.ts': 'export {};\n' },
      onReadPath: (path) => reads.push(path),
    }),
    readTreeAsync: () =>
      Promise.resolve({
        truncated: false,
        entries: [
          {
            mode: '120000',
            path: 'CLAUDE.md',
            sha: 'link-sha',
            size: 9,
            type: 'blob',
          },
          {
            mode: '100644',
            path: 'src/index.ts',
            sha: 'file-sha',
            size: 11,
            type: 'blob',
          },
        ],
      }),
  };

  const result = await materializeGitHubRepositoryWithGatewayAsync(
    { url: 'https://github.com/ankhorage/demo' },
    gateway,
  );

  expect(reads).toEqual(['src/index.ts']);
  expect(await readFile(join(result.rootPath, 'src/index.ts'), 'utf8')).toBe('export {};\n');
  expect(result.diagnostics).toEqual([
    {
      code: 'symlink-skipped',
      severity: 'warning',
      path: 'CLAUDE.md',
      message: 'Symbolic link skipped during safe GitHub repository materialization.',
    },
  ]);
  await expectMissingPathAsync(join(result.rootPath, 'CLAUDE.md'));
  await result.cleanupAsync();
});

function createGateway(options: {
  readonly files: Readonly<Record<string, string>>;
  readonly requestedRefs?: string[];
  readonly acceptedRefs?: readonly string[];
  readonly defaultBranch?: string;
  readonly truncated?: boolean;
  readonly onRead?: () => void;
  readonly onReadPath?: (path: string) => void;
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
      if (options.acceptedRefs !== undefined && !options.acceptedRefs.includes(ref)) {
        return Promise.reject(new Error(`Unknown fixture ref: ${ref}`));
      }
      return Promise.resolve({ commitSha: 'commit-sha', treeSha: 'tree-sha' });
    },
    readTreeAsync: () =>
      Promise.resolve({
        entries,
        truncated: options.truncated ?? false,
      }),
    readFileAsync: (_target, _revision, path) => {
      options.onRead?.();
      options.onReadPath?.(path);
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
