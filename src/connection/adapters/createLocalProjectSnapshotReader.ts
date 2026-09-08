import { lstat, readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';

import type { RepositoryManifest } from '@ankhorage/contracts/repository';
import ignore, { type Ignore } from 'ignore';

import type { ProjectSnapshot } from '../definitions/ProjectSnapshot.js';
import type { ProjectSnapshotEntry } from '../definitions/ProjectSnapshotEntry.js';
import type { ProjectSnapshotReader } from '../ports/ProjectSnapshotReader.js';

const REPOSITORY_MANIFEST_PATH = '.ankhorage/repository.json';
const HARD_EXCLUDED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  '.expo',
  'dist',
  'build',
  'coverage',
  '.cache',
  '.turbo',
]);
const SECRET_FILE_PATTERNS = [
  /^\.env(?:\..+)?$/u,
  /(?:^|\.)(?:pem|key|p12|pfx|keystore|mobileprovision)$/iu,
];
const SECRET_DATA_FILE_EXTENSIONS = new Set([
  '',
  '.conf',
  '.config',
  '.ini',
  '.json',
  '.plist',
  '.properties',
  '.toml',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);
const SECRET_DATA_FILE_NAME_PATTERN = /(?:credentials?|secrets?|service-account)/iu;

/** Create a deterministic, ignore-aware reader for standalone project snapshots. */
export function createLocalProjectSnapshotReader(): ProjectSnapshotReader {
  return { readAsync };
}

/** Read a complete safe project snapshot rooted only at the supplied project directory. */
async function readAsync(
  projectPath: string,
  repository: RepositoryManifest,
): Promise<ProjectSnapshot> {
  const root = resolve(projectPath);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) {
    throw new Error('Project path must be a directory.');
  }
  const matcher = await readIgnoreMatcher(root);
  const entries: ProjectSnapshotEntry[] = [];
  await visitDirectory(root, root, matcher, entries);
  const existingManifest = entries.find((entry) => entry.path === REPOSITORY_MANIFEST_PATH);
  const serializedManifest = `${JSON.stringify(repository, null, 2)}\n`;
  const manifestEntry: ProjectSnapshotEntry = {
    path: REPOSITORY_MANIFEST_PATH,
    mode: existingManifest?.mode ?? '100644',
    content: serializedManifest,
    encoding: 'utf-8',
  };
  const withoutManifest = entries.filter((entry) => entry.path !== REPOSITORY_MANIFEST_PATH);
  const allEntries = [...withoutManifest, manifestEntry].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  return Object.freeze({
    projectPath: root,
    repository,
    entries: Object.freeze(allEntries),
  });
}

/** Read root ignore rules without consulting any parent repository. */
async function readIgnoreMatcher(root: string): Promise<Ignore> {
  const matcher = ignore();
  try {
    const rules = await readFile(join(root, '.gitignore'), 'utf8');
    matcher.add(rules);
  } catch (error) {
    if (!isMissingFile(error)) {
      throw new Error(`Unable to read .gitignore: ${getErrorMessage(error)}`, { cause: error });
    }
  }
  return matcher;
}

/** Recursively visit safe regular files while rejecting links and special entries. */
async function visitDirectory(
  root: string,
  directory: string,
  matcher: Ignore,
  entries: ProjectSnapshotEntry[],
): Promise<void> {
  const children = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  for (const child of children) {
    const absolutePath = join(directory, child.name);
    const path = relative(root, absolutePath).split(sep).join('/');
    const stats = await lstat(absolutePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`Symlinks are not allowed in project snapshots: ${path}`);
    }
    if (!stats.isDirectory() && !stats.isFile()) {
      throw new Error(`Unsupported filesystem entry in project snapshot: ${path}`);
    }
    if (isHardExcluded(path, child.isDirectory())) continue;
    if (matcher.ignores(path) || matcher.ignores(`${path}/`)) continue;
    if (stats.isDirectory()) {
      await visitDirectory(root, absolutePath, matcher, entries);
      continue;
    }
    if (isSecretPath(path)) {
      if (path !== '.env.example') {
        throw new Error(`Secret-like file is not allowed in project snapshots: ${path}`);
      }
      continue;
    }
    const bytes = await readFile(absolutePath);
    entries.push(createEntry(path, bytes, stats.mode));
  }
}

/** Apply invariant exclusions before ignore rules can accidentally include generated files. */
function isHardExcluded(path: string, directory: boolean): boolean {
  const firstSegment = path.split('/')[0] ?? '';
  return directory && HARD_EXCLUDED_DIRECTORIES.has(firstSegment);
}

/** Identify credentials and private signing material by filename. */
function isSecretPath(path: string): boolean {
  const name = path.split('/').at(-1) ?? path;
  return (
    SECRET_FILE_PATTERNS.some((pattern) => pattern.test(name)) ||
    (SECRET_DATA_FILE_EXTENSIONS.has(extname(name).toLowerCase()) &&
      SECRET_DATA_FILE_NAME_PATTERN.test(name))
  );
}

/** Encode text and binary files in the representation required by Git blobs. */
function createEntry(path: string, bytes: Uint8Array, mode: number): ProjectSnapshotEntry {
  const isBinary = bytes.includes(0);
  return {
    path,
    mode: (mode & 0o111) === 0 ? '100644' : '100755',
    content: isBinary ? Buffer.from(bytes).toString('base64') : Buffer.from(bytes).toString('utf8'),
    encoding: isBinary ? 'base64' : 'utf-8',
  };
}

/** Distinguish an absent optional ignore file from other filesystem errors. */
function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/** Convert unknown filesystem failures to safe messages. */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown filesystem error';
}
