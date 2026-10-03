import type { MaterializeCommandOptions } from './definitions/MaterializeCommandOptions.js';

/*** Parse `ankh repository materialize <github-url>` and its optional ref/output flags. */
export function parseMaterializeCommandOptions(
  argv: readonly string[],
): MaterializeCommandOptions {
  let repositoryUrl: string | undefined;
  let ref: string | undefined;
  let destinationPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) continue;
    if (argument === '--ref' || argument === '--out') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === '--ref') ref = value;
      else destinationPath = value;
      continue;
    }
    if (argument.startsWith('--')) throw new Error(`Unknown option: ${argument}`);
    if (repositoryUrl !== undefined) {
      throw new Error('Only one GitHub repository URL may be provided.');
    }
    repositoryUrl = argument;
  }

  if (repositoryUrl === undefined) {
    throw new Error('A GitHub repository URL is required.');
  }
  return { repositoryUrl, ref, destinationPath };
}
