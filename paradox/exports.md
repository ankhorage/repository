# Public API

## connectGitHubRepositoryAsync

Kind: `function`
Module: `src/providers/github/services/connectGitHubRepositoryAsync.ts`
Source: `src/providers/github/services/connectGitHubRepositoryAsync.ts:31:1`

### Signatures

- `(options?: GitHubRepositoryConnectionOptions, dependencies?: GitHubRepositoryConnectionDependencies) => Promise<GitHubRepositoryConnectionResult>`
  - dependencies: `GitHubRepositoryConnectionDependencies` (optional)
  - options: `GitHubRepositoryConnectionOptions` (optional)
  - returns: `Promise<GitHubRepositoryConnectionResult>`

## connectRepositoryAsync

Kind: `function`
Module: `src/connection/services/connectRepositoryAsync.ts`
Source: `src/connection/services/connectRepositoryAsync.ts:71:1`

Connect the app project repository using only the standalone `RepositoryManifest` slice.

### Signatures

- `(options: RepositoryConnectionOptions) => Promise<RepositoryConnectionResult>`
  - options: `RepositoryConnectionOptions`
  - returns: `Promise<RepositoryConnectionResult>`

## discoverGitHubAuthenticatedUserRepositoriesAsync

Kind: `function`
Module: `src/providers/github/services/discoverGitHubAuthenticatedUserRepositoriesAsync.ts`
Source: `src/providers/github/services/discoverGitHubAuthenticatedUserRepositoriesAsync.ts:15:1`

List repositories GitHub makes available to one request-scoped authenticated user.

The result represents the caller's current GitHub access, which can be partial when OAuth scope,
organization approval, SSO, or repository permissions restrict visibility.

Security tests: `discoverGitHubAuthenticatedUserRepositoriesAsync.test.ts#fails closed for malformed public authenticated inventory credentials without network access`

### Signatures

- `(options: GitHubAuthenticatedUserRepositoryInventoryOptions) => Promise<GitHubAuthenticatedUserRepositoryInventoryResult>`
  - options: `GitHubAuthenticatedUserRepositoryInventoryOptions`
  - returns: `Promise<GitHubAuthenticatedUserRepositoryInventoryResult>`

## discoverGitHubRepositoriesAsync

Kind: `function`
Module: `src/providers/github/services/discoverGitHubRepositoriesAsync.ts`
Source: `src/providers/github/services/discoverGitHubRepositoriesAsync.ts:7:1`

### Signatures

- `(options: GitHubRepositoryDiscoveryOptions) => Promise<GitHubRepositoryDiscoveryResult>`
  - options: `GitHubRepositoryDiscoveryOptions`
  - returns: `Promise<GitHubRepositoryDiscoveryResult>`

## GitHubAuthenticatedUserRepositoryInventoryOptions

Kind: `type`
Module: `src/providers/github/definitions/GitHubAuthenticatedUserRepositoryInventoryOptions.ts`
Source: `src/providers/github/definitions/GitHubAuthenticatedUserRepositoryInventoryOptions.ts:4:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| authentication | property | `GitHubRepositoryUserAuthentication` | yes |  |
| signal | property | `AbortSignal \| undefined` | no |  |

## GitHubAuthenticatedUserRepositoryInventoryResult

Kind: `type`
Module: `src/providers/github/definitions/GitHubAuthenticatedUserRepositoryInventoryResult.ts`
Source: `src/providers/github/definitions/GitHubAuthenticatedUserRepositoryInventoryResult.ts:4:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| repositories | property | `readonly GitHubRepositoryDiscoveryRepository[]` | yes |  |

## GitHubOwnerType

Kind: `unknown`
Module: `src/providers/github/definitions/GitHubRepositoryDiscoveryResult.ts`
Source: `src/providers/github/definitions/GitHubRepositoryDiscoveryResult.ts:1:1`

## GitHubRepositoryAuthentication

Kind: `unknown`
Module: `src/providers/github/definitions/GitHubRepositoryDiscoveryOptions.ts`
Source: `src/providers/github/definitions/GitHubRepositoryDiscoveryOptions.ts:8:1`

## GitHubRepositoryConnectionFailure

Kind: `type`
Module: `src/providers/github/definitions/GitHubRepositoryConnectionResult.ts`
Source: `src/providers/github/definitions/GitHubRepositoryConnectionResult.ts:18:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| code | property | `string` | yes |  |
| message | property | `string` | yes |  |
| repository | property | `GitHubRepositoryConnectionIdentity \| undefined` | no |  |
| stage | property | `string` | yes |  |
| status | property | `GitHubRepositoryConnectionFailureKind` | yes |  |

## GitHubRepositoryConnectionOptions

Kind: `type`
Module: `src/providers/github/definitions/GitHubRepositoryConnectionOptions.ts`
Source: `src/providers/github/definitions/GitHubRepositoryConnectionOptions.ts:3:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| name | property | `string \| undefined` | no |  |
| owner | property | `string \| undefined` | no |  |
| projectPath | property | `string \| undefined` | no |  |
| visibility | property | `GitHubRepositoryVisibility \| undefined` | no |  |

## GitHubRepositoryConnectionResult

Kind: `unknown`
Module: `src/providers/github/definitions/GitHubRepositoryConnectionResult.ts`
Source: `src/providers/github/definitions/GitHubRepositoryConnectionResult.ts:26:1`

## GitHubRepositoryConnectionStatus

Kind: `unknown`
Module: `src/providers/github/definitions/GitHubRepositoryConnectionResult.ts`
Source: `src/providers/github/definitions/GitHubRepositoryConnectionResult.ts:1:1`

## GitHubRepositoryDiscoveryError

Kind: `type`
Module: `src/providers/github/definitions/GitHubRepositoryDiscoveryResult.ts`
Source: `src/providers/github/definitions/GitHubRepositoryDiscoveryResult.ts:31:1`

## GitHubRepositoryDiscoveryErrorCode

Kind: `unknown`
Module: `src/providers/github/definitions/GitHubRepositoryDiscoveryResult.ts`
Source: `src/providers/github/definitions/GitHubRepositoryDiscoveryResult.ts:21:1`

## GitHubRepositoryDiscoveryOptions

Kind: `type`
Module: `src/providers/github/definitions/GitHubRepositoryDiscoveryOptions.ts`
Source: `src/providers/github/definitions/GitHubRepositoryDiscoveryOptions.ts:12:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| authentication | property | `GitHubRepositoryAuthentication \| undefined` | no |  |
| signal | property | `AbortSignal \| undefined` | no |  |
| source | property | `string` | yes |  |

## GitHubRepositoryDiscoveryRepository

Kind: `type`
Module: `src/providers/github/definitions/GitHubRepositoryDiscoveryResult.ts`
Source: `src/providers/github/definitions/GitHubRepositoryDiscoveryResult.ts:3:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| id | property | `string` | yes |  |
| name | property | `string` | yes |  |
| owner | property | `string` | yes |  |
| url | property | `string` | yes |  |
| visibility | property | `GitHubRepositoryVisibility` | yes |  |

## GitHubRepositoryDiscoveryResult

Kind: `type`
Module: `src/providers/github/definitions/GitHubRepositoryDiscoveryResult.ts`
Source: `src/providers/github/definitions/GitHubRepositoryDiscoveryResult.ts:11:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| owner | property | `{ readonly login: string; readonly type: GitHubOwnerType; readonly url: string; }` | yes |  |
| repositories | property | `readonly GitHubRepositoryDiscoveryRepository[]` | yes |  |
| selectedRepository | property | `GitHubRepositoryDiscoveryRepository \| undefined` | no |  |

## GitHubRepositoryMaterializationDiagnostic

Kind: `type`
Module: `src/providers/github/definitions/GitHubRepositoryMaterializationResult.ts`
Source: `src/providers/github/definitions/GitHubRepositoryMaterializationResult.ts:14:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| code | property | `"symlink-skipped"` | yes |  |
| message | property | `string` | yes |  |
| path | property | `string` | yes |  |
| severity | property | `"warning"` | yes |  |

## GitHubRepositoryMaterializationOptions

Kind: `type`
Module: `src/providers/github/definitions/GitHubRepositoryMaterializationOptions.ts`
Source: `src/providers/github/definitions/GitHubRepositoryMaterializationOptions.ts:3:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| authentication | property | `GitHubRepositoryAuthentication \| undefined` | no |  |
| destinationPath | property | `string \| undefined` | no |  |
| ref | property | `string \| undefined` | no |  |
| signal | property | `AbortSignal \| undefined` | no |  |
| url | property | `string` | yes |  |

## GitHubRepositoryMaterializationResult

Kind: `type`
Module: `src/providers/github/definitions/GitHubRepositoryMaterializationResult.ts`
Source: `src/providers/github/definitions/GitHubRepositoryMaterializationResult.ts:1:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| cleanupAsync | property | `() => Promise<void>` | yes |  |
| diagnostics | property | `readonly GitHubRepositoryMaterializationDiagnostic[]` | yes |  |
| repository | property | `{ readonly owner: string; readonly name: string; readonly url: string; readonly defaultBranch: string; }` | yes |  |
| revision | property | `string` | yes |  |
| rootPath | property | `string` | yes |  |

## GitHubRepositoryRevisionResolutionOptions

Kind: `type`
Module: `src/providers/github/definitions/GitHubRepositoryRevisionResolutionOptions.ts`
Source: `src/providers/github/definitions/GitHubRepositoryRevisionResolutionOptions.ts:4:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| authentication | property | `GitHubRepositoryAuthentication \| undefined` | no |  |
| signal | property | `AbortSignal \| undefined` | no |  |
| url | property | `string` | yes |  |

## GitHubRepositoryRevisionResolutionResult

Kind: `type`
Module: `src/providers/github/definitions/GitHubRepositoryRevisionResolutionResult.ts`
Source: `src/providers/github/definitions/GitHubRepositoryRevisionResolutionResult.ts:2:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| repository | property | `{ readonly id: string; readonly owner: string; readonly name: string; readonly url: string; readonly defaultBranch: string; }` | yes |  |
| revision | property | `{ readonly commitSha: string; readonly ref: string; }` | yes |  |

## GitHubRepositoryUserAuthentication

Kind: `type`
Module: `src/providers/github/definitions/GitHubRepositoryDiscoveryOptions.ts`
Source: `src/providers/github/definitions/GitHubRepositoryDiscoveryOptions.ts:2:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| accessToken | property | `string` | yes |  |
| kind | property | `"user"` | yes |  |

## GitHubRepositoryVisibility

Kind: `unknown`
Module: `src/providers/github/definitions/GitHubRepositoryVisibility.ts`
Source: `src/providers/github/definitions/GitHubRepositoryVisibility.ts:1:1`

## materializeGitHubRepositoryAsync

Kind: `function`
Module: `src/providers/github/services/materializeGitHubRepositoryAsync.ts`
Source: `src/providers/github/services/materializeGitHubRepositoryAsync.ts:7:1`

Materialize one GitHub repository URL into an isolated local filesystem snapshot.

### Signatures

- `(options: GitHubRepositoryMaterializationOptions) => Promise<GitHubRepositoryMaterializationResult>`
  - options: `GitHubRepositoryMaterializationOptions`
  - returns: `Promise<GitHubRepositoryMaterializationResult>`

## REPOSITORY_PACKAGE_METADATA

Kind: `value`
Module: `src/metadata/index.ts`
Source: `src/metadata/index.ts:3:14`

## RepositoryConnectionFailure

Kind: `type`
Module: `src/connection/definitions/RepositoryConnectionResult.ts`
Source: `src/connection/definitions/RepositoryConnectionResult.ts:11:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| code | property | `string` | yes |  |
| message | property | `string` | yes |  |
| repository | property | `RepositoryManifest \| undefined` | no |  |
| stage | property | `string` | yes |  |
| status | property | `"recoverable-failure" \| "conflict"` | yes |  |

## RepositoryConnectionOptions

Kind: `type`
Module: `src/connection/definitions/RepositoryConnectionOptions.ts`
Source: `src/connection/definitions/RepositoryConnectionOptions.ts:5:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| projectPath | property | `string \| undefined` | no |  |
| repository | property | `RepositoryManifest` | yes |  |
| visibility | property | `RepositoryVisibility \| undefined` | no |  |

## RepositoryConnectionResult

Kind: `unknown`
Module: `src/connection/definitions/RepositoryConnectionResult.ts`
Source: `src/connection/definitions/RepositoryConnectionResult.ts:19:1`

## RepositoryConnectionStatus

Kind: `unknown`
Module: `src/connection/definitions/RepositoryConnectionResult.ts`
Source: `src/connection/definitions/RepositoryConnectionResult.ts:3:1`

## RepositoryVisibility

Kind: `unknown`
Module: `src/connection/definitions/RepositoryConnectionOptions.ts`
Source: `src/connection/definitions/RepositoryConnectionOptions.ts:3:1`

## resolveGitHubRepositoryRevisionAsync

Kind: `function`
Module: `src/providers/github/services/resolveGitHubRepositoryRevisionAsync.ts`
Source: `src/providers/github/services/resolveGitHubRepositoryRevisionAsync.ts:7:1`

### Signatures

- `(options: GitHubRepositoryRevisionResolutionOptions) => Promise<GitHubRepositoryRevisionResolutionResult>`
  - options: `GitHubRepositoryRevisionResolutionOptions`
  - returns: `Promise<GitHubRepositoryRevisionResolutionResult>`
