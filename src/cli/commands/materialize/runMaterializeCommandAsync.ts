import { materializeGitHubRepositoryAsync } from '../../../providers/github/services/materializeGitHubRepositoryAsync.js';
import { parseMaterializeCommandOptions } from './parseMaterializeCommandOptions.js';

export interface MaterializeCommandRequest {
  readonly argv?: readonly string[];
  readonly stdout?: (line: string) => void;
  readonly stderr?: (line: string) => void;
}

/*** Materialize one GitHub repository and print the immutable revision plus local root. */
export async function runMaterializeCommandAsync(
  request: MaterializeCommandRequest = {},
): Promise<{ readonly exitCode: number }> {
  const stdout = request.stdout ?? console.log;
  const stderr = request.stderr ?? console.error;

  try {
    const options = parseMaterializeCommandOptions(request.argv ?? []);
    const result = await materializeGitHubRepositoryAsync({
      url: options.repositoryUrl,
      ...(options.ref === undefined ? {} : { ref: options.ref }),
      ...(options.destinationPath === undefined
        ? {}
        : { destinationPath: options.destinationPath }),
    });
    stdout(
      JSON.stringify({
        rootPath: result.rootPath,
        revision: result.revision,
        repository: result.repository,
      }),
    );
    return { exitCode: 0 };
  } catch (error) {
    stderr(error instanceof Error ? error.message : 'Repository materialization failed.');
    return { exitCode: 1 };
  }
}
