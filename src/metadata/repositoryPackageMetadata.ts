import packageJson from '../../package.json';

export const repositoryPackageMetadata = {
  packageName: packageJson.name,
  provider: 'repository' as const,
  category: 'repository' as const,
  version: packageJson.version,
  capabilities: ['repository.connect', 'repository.materialize'] as const,
  command: {
    path: ['connect'] as const,
    capability: 'repository.connect' as const,
    summary: 'Create or safely resume a source repository connection.',
  },
  materializeCommand: {
    path: ['materialize'] as const,
    capability: 'repository.materialize' as const,
    summary: 'Materialize a GitHub repository URL as a local filesystem snapshot.',
  },
} as const;
