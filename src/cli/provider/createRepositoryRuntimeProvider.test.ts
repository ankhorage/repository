import { expect, test } from 'bun:test';

import packageJson from '../../../package.json';
import { createRepositoryRuntimeProvider } from './createRepositoryRuntimeProvider.js';

test('reports the installed package version and canonical repository capabilities', () => {
  expect(createRepositoryRuntimeProvider()).toMatchObject({
    id: 'repository',
    category: 'repository',
    version: packageJson.version,
    capabilities: ['repository.connect', 'repository.materialize'],
    commands: [
      { path: ['connect'], capability: 'repository.connect' },
      { path: ['materialize'], capability: 'repository.materialize' },
    ],
  });
});
