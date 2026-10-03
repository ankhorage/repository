import { defineParadoxConfig } from '@ankhorage/paradox';

export default defineParadoxConfig({
  mode: 'write',
  docs: {
    title: '@ankhorage/repository',
    description:
      "Standalone repository capability for connecting and managing an app project's source repository.",
    usage: {
      entrypoints: ['examples/basic-usage/main.ts'],
    },
  },
  package: {
    entrypoints: ['src/index.ts', 'src/github/index.ts', 'src/metadata/index.ts'],
  },
  output: {
    dir: 'paradox',
  },
});
