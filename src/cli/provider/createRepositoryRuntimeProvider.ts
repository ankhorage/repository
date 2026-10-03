import { repositoryPackageMetadata } from '../../metadata/repositoryPackageMetadata.js';
import {
  type ConnectCommandRequest,
  runConnectCommandAsync,
} from '../commands/connect/runConnectCommandAsync.js';
import {
  type MaterializeCommandRequest,
  runMaterializeCommandAsync,
} from '../commands/materialize/runMaterializeCommandAsync.js';

export interface RepositoryRuntimeProvider {
  readonly id: 'repository';
  readonly category: 'repository';
  readonly version: string;
  readonly capabilities: readonly ['repository.connect', 'repository.materialize'];
  readonly commands: readonly [
    {
      readonly path: readonly ['connect'];
      readonly capability: 'repository.connect';
      readonly summary: string;
    },
    {
      readonly path: readonly ['materialize'];
      readonly capability: 'repository.materialize';
      readonly summary: string;
    },
  ];
  readonly handlers: readonly [
    {
      readonly path: readonly ['connect'];
      readonly handler: (request: ConnectCommandRequest) => Promise<{ readonly exitCode: number }>;
    },
    {
      readonly path: readonly ['materialize'];
      readonly handler: (
        request: MaterializeCommandRequest,
      ) => Promise<{ readonly exitCode: number }>;
    },
  ];
}

/*** Create the package-level Ankh provider for repository connect and materialization commands. */
export function createRepositoryRuntimeProvider(): RepositoryRuntimeProvider {
  return {
    id: repositoryPackageMetadata.provider,
    category: repositoryPackageMetadata.category,
    version: repositoryPackageMetadata.version,
    capabilities: repositoryPackageMetadata.capabilities,
    commands: [
      repositoryPackageMetadata.command,
      repositoryPackageMetadata.materializeCommand,
    ],
    handlers: [
      { path: ['connect'], handler: runConnectCommandAsync },
      { path: ['materialize'], handler: runMaterializeCommandAsync },
    ],
  };
}
