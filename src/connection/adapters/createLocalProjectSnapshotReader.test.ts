import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RepositoryManifest } from '@ankhorage/contracts/repository';
import { expect, test } from 'bun:test';

import { createLocalProjectSnapshotReader } from './createLocalProjectSnapshotReader.js';

const REPOSITORY: RepositoryManifest = {
  provider: 'github',
  owner: 'ankhorage',
  name: 'demo',
  url: 'https://github.com/ankhorage/demo',
  defaultBranch: 'main',
};

test('excludes an ignored secret-like file before validating snapshot candidates', async () => {
  const projectPath = await mkdtemp(join(tmpdir(), 'repository-snapshot-reader-'));

  try {
    await Promise.all([
      writeFile(join(projectPath, '.gitignore'), '.env*.local\n', 'utf8'),
      writeFile(join(projectPath, '.env.local'), 'ignored fixture\n', { mode: 0o600 }),
      writeFile(join(projectPath, 'index.ts'), 'export {};\n', 'utf8'),
    ]);

    const snapshot = await createLocalProjectSnapshotReader().readAsync(projectPath, REPOSITORY);

    expect(snapshot.entries.map((entry) => entry.path)).toEqual([
      '.ankhorage/repository.json',
      '.gitignore',
      'index.ts',
    ]);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('includes application source whose filename describes secret administration', async () => {
  const projectPath = await mkdtemp(join(tmpdir(), 'repository-snapshot-reader-'));
  const sourceDirectory = join(projectPath, 'src', 'app', 'ankh');

  try {
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(
      join(sourceDirectory, 'secrets.tsx'),
      'export default function SecretsScreen() { return null; }\n',
      'utf8',
    );

    const snapshot = await createLocalProjectSnapshotReader().readAsync(projectPath, REPOSITORY);

    expect(snapshot.entries.map((entry) => entry.path)).toEqual([
      '.ankhorage/repository.json',
      'src/app/ankh/secrets.tsx',
    ]);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('rejects a non-ignored secret-like snapshot candidate', async () => {
  const projectPath = await mkdtemp(join(tmpdir(), 'repository-snapshot-reader-'));

  try {
    await writeFile(join(projectPath, '.env.local'), 'blocked fixture\n', { mode: 0o600 });

    let rejection: unknown;
    try {
      await createLocalProjectSnapshotReader().readAsync(projectPath, REPOSITORY);
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Error);
    if (!(rejection instanceof Error)) {
      throw new Error('Expected the snapshot reader to reject a non-ignored secret-like file.');
    }
    expect(rejection.message).toBe(
      'Secret-like file is not allowed in project snapshots: .env.local',
    );
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test.each(['secrets.json', 'credentials.yaml', 'google-service-account.json'])(
  'rejects a non-ignored credential data file named %s',
  async (filename) => {
    const projectPath = await mkdtemp(join(tmpdir(), 'repository-snapshot-reader-'));

    try {
      await writeFile(join(projectPath, filename), 'blocked fixture\n', { mode: 0o600 });

      expect(createLocalProjectSnapshotReader().readAsync(projectPath, REPOSITORY)).rejects.toThrow(
        `Secret-like file is not allowed in project snapshots: ${filename}`,
      );
    } finally {
      await rm(projectPath, { recursive: true, force: true });
    }
  },
);
