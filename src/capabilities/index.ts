import type { Capability } from '@ankhorage/contracts/capability';

/*** Publish Repository's executable connection and materialization operations for Ankh discovery. */
export const CAPABILITIES = [
  {
    id: 'repository.connect',
    owner: '@ankhorage/repository',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Connect repository',
    description: 'Create or safely resume a source repository connection.',
  },
  {
    id: 'repository.materialize',
    owner: '@ankhorage/repository',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    label: 'Materialize repository',
    description: 'Materialize a GitHub repository revision as a local filesystem snapshot.',
  },
] as const satisfies readonly Capability[];
