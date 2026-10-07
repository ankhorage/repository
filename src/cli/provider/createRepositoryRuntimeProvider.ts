import type { AnkhRuntimeCommandProvider } from '@ankhorage/ankh';

import packageJson from '../../../package.json';
import { CAPABILITIES } from '../../capabilities/index.js';
import { runConnectCommandAsync } from '../commands/connect/runConnectCommandAsync.js';
import { runMaterializeCommandAsync } from '../commands/materialize/runMaterializeCommandAsync.js';

/*** Create the package-level Ankh provider for repository connect and materialization commands. */
export function createRepositoryRuntimeProvider(): AnkhRuntimeCommandProvider {
  return {
    id: 'repository',
    category: 'repository',
    version: packageJson.version,
    capabilities: CAPABILITIES,
    commands: [
      {
        path: ['connect'],
        capability: CAPABILITIES[0].id,
        summary: 'Create or safely resume a source repository connection.',
      },
      {
        path: ['materialize'],
        capability: CAPABILITIES[1].id,
        summary: 'Materialize a GitHub repository URL as a local filesystem snapshot.',
      },
    ],
    handlers: [
      { path: ['connect'], handler: runConnectCommandAsync },
      { path: ['materialize'], handler: runMaterializeCommandAsync },
    ],
  } satisfies AnkhRuntimeCommandProvider;
}
