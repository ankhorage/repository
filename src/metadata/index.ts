export const REPOSITORY_PACKAGE_METADATA = {
  packageName: '@ankhorage/repository',
  manifestProperty: 'repository',
  contractSubpath: '@ankhorage/contracts/repository',
  providers: ['github'],
  capabilities: ['repository.connect', 'repository.materialize'],
  github: {
    cli: 'gh',
    defaultBranch: 'main',
  },
} as const;
