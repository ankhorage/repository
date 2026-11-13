import { expect, test } from 'bun:test';

import * as github from './index.js';

test('exports public GitHub operations', () => {
  expect(github.resolveGitHubRepositoryRevisionAsync).toBeFunction();
  expect(github.materializeGitHubRepositoryAsync).toBeFunction();
  expect(github.discoverGitHubRepositoriesAsync).toBeFunction();
  expect(github.discoverGitHubAuthenticatedUserRepositoriesAsync).toBeFunction();
});
