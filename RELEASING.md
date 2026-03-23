# Releasing

This repository publishes to npm through GitHub trusted publishing, so a release
means pushing a version tag that triggers the `publish.yml` workflow, publishing
the tagged commit to npm, and keeping the changelog in sync with the code that
shipped.

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
3. Tag that commit with the package version, for example `v0.1.0`, and push the
   tag so the `publish.yml` workflow runs.
4. Confirm the publish workflow succeeds for the tag you just pushed.
5. Draft the GitHub release notes from the versioned changelog section that
   shipped in the tagged commit.
6. Publish the release notes on GitHub.

## After The Release

1. Start the next `Unreleased` section with the next set of user-visible changes.
2. If the release process changes contributor expectations, update the README or
   workflow docs alongside the process change.

## Release Gates

The repository also includes a manual GitHub Actions workflow,
[`.github/workflows/release-check.yml`](./.github/workflows/release-check.yml),
that runs the same validation stack on request. Use it when you want a clean
CI-backed release candidate check before tagging.

The repository also includes a publish workflow,
[`.github/workflows/publish.yml`](./.github/workflows/publish.yml), that is
wired for GitHub trusted publishing. It runs when a version tag like `v0.1.0`
is pushed. The workflow runs the default test suite before installing the
`codex` CLI so publish jobs stay aligned with the normal CI surface instead of
turning on the live integration suite as a side effect of release tooling. If a
tagged publish run needs to be retried, re-run that workflow for the same tag
instead of dispatching a fresh publish from an arbitrary ref.
