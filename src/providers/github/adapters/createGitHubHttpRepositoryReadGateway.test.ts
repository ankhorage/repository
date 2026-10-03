import { expect, test } from 'bun:test';

import { createGitHubHttpRepositoryReadGateway } from './createGitHubHttpRepositoryReadGateway.js';

test('reads repository metadata, immutable revision, tree, and raw file content', async () => {
  const urls: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith('/repos/ankhorage/demo')) {
      return Response.json({
        default_branch: 'main',
        html_url: 'https://github.com/ankhorage/demo',
      });
    }
    if (url.endsWith('/repos/ankhorage/demo/commits/feature%2Fread')) {
      return Response.json({
        sha: 'commit-sha',
        commit: { tree: { sha: 'tree-sha' } },
      });
    }
    if (url.endsWith('/repos/ankhorage/demo/git/trees/tree-sha?recursive=1')) {
      return Response.json({
        truncated: false,
        tree: [
          {
            path: 'src/index.ts',
            mode: '100644',
            type: 'blob',
            sha: 'blob-sha',
            size: 10,
          },
        ],
      });
    }
    if (url.endsWith('/ankhorage/demo/commit-sha/src/index.ts')) {
      return new Response('0123456789');
    }
    return new Response('', { status: 404 });
  }) as typeof fetch;

  const gateway = createGitHubHttpRepositoryReadGateway(fetcher);
  const target = {
    owner: 'ankhorage',
    name: 'demo',
    url: 'https://github.com/ankhorage/demo',
  };

  expect(await gateway.inspectRepositoryAsync(target)).toEqual({
    defaultBranch: 'main',
    url: 'https://github.com/ankhorage/demo',
  });
  expect(await gateway.resolveRevisionAsync(target, 'feature/read')).toEqual({
    commitSha: 'commit-sha',
    treeSha: 'tree-sha',
  });
  expect(await gateway.readTreeAsync(target, 'tree-sha')).toEqual({
    entries: [
      {
        path: 'src/index.ts',
        mode: '100644',
        type: 'blob',
        sha: 'blob-sha',
        size: 10,
      },
    ],
    truncated: false,
  });
  expect(
    Buffer.from(await gateway.readFileAsync(target, 'commit-sha', 'src/index.ts')).toString(),
  ).toBe('0123456789');
  expect(urls).toContain(
    'https://raw.githubusercontent.com/ankhorage/demo/commit-sha/src/index.ts',
  );
});
