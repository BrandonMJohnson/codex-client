# Releasing

This repository does not publish to npm yet, so a release means cutting a tagged
GitHub release and keeping the changelog in sync with the code that shipped.

## Before A Release

1. Update `CHANGELOG.md` with the user-visible changes that should ship.
2. Make sure `README.md`, the docs site, and any release-facing workflow docs
   still match the current package contract.
3. Make sure the main branch CI checks are green before you start a release.
4. Run the release validation command:

```bash
npm run release:check
```

That command runs the same checks we expect from a release candidate:

- binding regeneration verification
- type checking
- build output verification
- package-surface smoke checks
- docs site build

The full test suite is already covered by the normal CI workflow, so release
validation focuses on the packaging and documentation surfaces that are easy to
drift while preparing a tag.

The release validation command expects the `codex` CLI to be available locally
so the bindings check can compare against the generator version recorded in
`src/generated/manifest.json`. The GitHub Actions workflow installs that version
automatically when you use the release gate in CI.

## Cutting The Release

1. Move the shipped notes out of `Unreleased` into a dated release section in
   `CHANGELOG.md`.
2. Create the release commit on `main` after all review and QA feedback is
   resolved.
3. Tag that commit with the package version, for example `v0.1.0`.
4. Draft the GitHub release notes from the versioned changelog section that
   shipped in the tagged commit.
5. Publish the release notes on GitHub.

## After The Release

1. Start the next `Unreleased` section with the next set of user-visible changes.
2. If the release process changes contributor expectations, update the README or
   workflow docs alongside the process change.

## Release Gate

The repository also includes a manual GitHub Actions workflow,
[`.github/workflows/release-check.yml`](./.github/workflows/release-check.yml),
that runs the same validation stack on request. Use it when you want a clean
CI-backed release candidate check before tagging.
