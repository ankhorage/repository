# @ankhorage/repository

## 0.4.1

### Patch Changes

- 1e6fedd: Update Ankhorage dependencies: `@ankhorage/contracts`.

## 0.4.0

### Minor Changes

- b156251: Rename the standalone capability from `@ankhorage/gh` to `@ankhorage/repository`, consume the focused `RepositoryManifest` slice, persist it at `.ankhorage/repository.json`, expose a provider-neutral connection API and `repository.connect` capability with package-derived version metadata, and isolate GitHub-specific implementation under `providers/github` and the `./github` provider subpath.

### Patch Changes

- a9bf4e7: Update documentation

## 0.3.1

### Patch Changes

- f548067: Correct the generated usage documentation to import the public package entrypoint.

## 0.3.0

### Minor Changes

- 554bdf3: Make GitHub connection configuration standalone by using the shared `RepositoryConfig` contract in `.ankhorage/gh.json` instead of requiring a complete `ankh.config.json`.

## 0.2.1

### Patch Changes

- f246d47: Add a root usage example and Paradox-generated usage documentation.

## 0.2.0

### Minor Changes

- e4df77f: Add the gh-only GitHub repository connection API and `ankh gh connect` provider.

## 0.1.0

### Minor Changes

- 3b2e65c: Establish the standalone GitHub integration package boundary and canonical Ankhorage tooling.

All notable changes to this package will be documented in this file by Changesets.
