import { CAPABILITIES } from '../capabilities/index.js';

export const REPOSITORY_PACKAGE_METADATA = {
  packageName: '@ankhorage/repository',
  manifestProperty: 'repository',
  contractSubpath: '@ankhorage/contracts/repository',
  providers: ['github'],
  capabilities: CAPABILITIES,
  github: {
    cli: 'gh',
    defaultBranch: 'main',
  },
} as const;
