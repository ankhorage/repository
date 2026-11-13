export type { GitHubAuthenticatedUserRepositoryInventoryOptions } from '../providers/github/definitions/GitHubAuthenticatedUserRepositoryInventoryOptions.js';
export type { GitHubAuthenticatedUserRepositoryInventoryResult } from '../providers/github/definitions/GitHubAuthenticatedUserRepositoryInventoryResult.js';
export type { GitHubRepositoryConnectionOptions } from '../providers/github/definitions/GitHubRepositoryConnectionOptions.js';
export type {
  GitHubRepositoryConnectionFailure,
  GitHubRepositoryConnectionResult,
  GitHubRepositoryConnectionStatus,
} from '../providers/github/definitions/GitHubRepositoryConnectionResult.js';
export type {
  GitHubRepositoryAuthentication,
  GitHubRepositoryDiscoveryOptions,
  GitHubRepositoryUserAuthentication,
} from '../providers/github/definitions/GitHubRepositoryDiscoveryOptions.js';
export {
  type GitHubOwnerType,
  GitHubRepositoryDiscoveryError,
  type GitHubRepositoryDiscoveryErrorCode,
  type GitHubRepositoryDiscoveryRepository,
  type GitHubRepositoryDiscoveryResult,
} from '../providers/github/definitions/GitHubRepositoryDiscoveryResult.js';
export type { GitHubRepositoryMaterializationOptions } from '../providers/github/definitions/GitHubRepositoryMaterializationOptions.js';
export type {
  GitHubRepositoryMaterializationDiagnostic,
  GitHubRepositoryMaterializationResult,
} from '../providers/github/definitions/GitHubRepositoryMaterializationResult.js';
export type { GitHubRepositoryRevisionResolutionOptions } from '../providers/github/definitions/GitHubRepositoryRevisionResolutionOptions.js';
export type { GitHubRepositoryRevisionResolutionResult } from '../providers/github/definitions/GitHubRepositoryRevisionResolutionResult.js';
export type { GitHubRepositoryVisibility } from '../providers/github/definitions/GitHubRepositoryVisibility.js';
export { connectGitHubRepositoryAsync } from '../providers/github/services/connectGitHubRepositoryAsync.js';
export { discoverGitHubAuthenticatedUserRepositoriesAsync } from '../providers/github/services/discoverGitHubAuthenticatedUserRepositoriesAsync.js';
export { discoverGitHubRepositoriesAsync } from '../providers/github/services/discoverGitHubRepositoriesAsync.js';
export { materializeGitHubRepositoryAsync } from '../providers/github/services/materializeGitHubRepositoryAsync.js';
export { resolveGitHubRepositoryRevisionAsync } from '../providers/github/services/resolveGitHubRepositoryRevisionAsync.js';
