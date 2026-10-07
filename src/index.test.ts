import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { expect, test } from 'bun:test';

import { CAPABILITIES } from './capabilities/index.js';
import * as packageApi from './index.js';
import { REPOSITORY_PACKAGE_METADATA } from './metadata/index.js';

test('exports only the provider-neutral repository API', () => {
  expect(Object.keys(packageApi).sort()).toEqual(['connectRepositoryAsync']);
});

test('publishes repository manifest authoring metadata', () => {
  expect(REPOSITORY_PACKAGE_METADATA).toMatchObject({
    packageName: '@ankhorage/repository',
    manifestProperty: 'repository',
    contractSubpath: '@ankhorage/contracts/repository',
    providers: ['github'],
  });
  expect(REPOSITORY_PACKAGE_METADATA.capabilities).toBe(CAPABILITIES);
});

async function collectProductionTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) return collectProductionTypeScriptFiles(full);
      return ['.ts', '.tsx'].includes(extname(entry.name)) && !entry.name.endsWith('.test.ts')
        ? [full]
        : [];
    }),
  );
  return nested.flat();
}

test('never imports the full app manifest into production source', async () => {
  const forbidden = ['App', 'Manifest'].join('');
  const files = await collectProductionTypeScriptFiles(join(process.cwd(), 'src'));
  const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')));

  expect(contents.some((content) => content.includes(forbidden))).toBe(false);
});
