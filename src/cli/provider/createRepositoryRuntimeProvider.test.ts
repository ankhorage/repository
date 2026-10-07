import { expect, test } from 'bun:test';

import packageJson from '../../../package.json';
import { CAPABILITIES } from '../../capabilities/index.js';
import { createRepositoryRuntimeProvider } from './createRepositoryRuntimeProvider.js';

test('uses the canonical catalog and exposes only catalog command capabilities', () => {
  const provider = createRepositoryRuntimeProvider();

  expect(provider).toMatchObject({
    id: 'repository',
    category: 'repository',
    version: packageJson.version,
  });
  expect(provider.capabilities).toBe(CAPABILITIES);
  const commandCapabilityIds = provider.commands.map(({ capability }) => capability);
  const catalogCapabilityIds = CAPABILITIES.map(({ id }) => id);

  expect(commandCapabilityIds).toHaveLength(catalogCapabilityIds.length);
  expect(new Set(commandCapabilityIds).size).toBe(commandCapabilityIds.length);
  expect(new Set(commandCapabilityIds)).toEqual(new Set(catalogCapabilityIds));
});
