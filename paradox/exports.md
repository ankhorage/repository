# Public API

## connectGitHubRepositoryAsync

Kind: `function`
Module: `src/providers/github/services/connectGitHubRepositoryAsync.ts`
Source: `src/providers/github/services/connectGitHubRepositoryAsync.ts:27:1`

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
Source: `src/providers/github/definitions/GitHubRepositoryConnectionOptions.ts:6:1`

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

## GitHubRepositoryVisibility

Kind: `unknown`
Module: `src/providers/github/definitions/GitHubRepositoryVisibility.ts`
Source: `src/providers/github/definitions/GitHubRepositoryVisibility.ts:1:1`

## REPOSITORY_PACKAGE_METADATA

Kind: `value`
Module: `src/metadata/index.ts`
Source: `src/metadata/index.ts:1:14`

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
