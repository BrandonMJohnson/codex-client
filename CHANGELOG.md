# Changelog

All notable changes to `codex-app-server-client` should be recorded here.

The repository follows a lightweight Keep a Changelog style:

- add user-visible notes under `Unreleased` while work is in progress
- move those notes into a dated release section before tagging the release commit
- keep release notes focused on observable behavior, docs, and packaging changes

## Unreleased

Add short bullet points here before each release.

## 0.1.3 - 2026-03-22

- Added explicit repository metadata to `package.json` so npm can verify GitHub trusted-publishing provenance against `https://github.com/BrandonMJohnson/codex-client`.
- Kept the release surface otherwise unchanged while retrying the failed provenance-backed publish path.

## 0.1.2 - 2026-03-22

- Split the default `npm test` suite from the live app-server integration suite so trusted-publishing and normal CI runs stay on the non-live test surface.
- Kept real app-server coverage available explicitly through `npm run test:integration`.
- Updated release and contributor docs to reflect the separated default and integration test paths.

## 0.1.1 - 2026-03-22

- Added a tag-driven `publish.yml` GitHub Actions workflow for npm trusted publishing.
- Updated the release guide to document the trusted-publishing flow and tag-based publish trigger.
- Updated install docs to point consumers at `npm install codex-app-server-client`.
- Synced the implementation plan with the standardized npm, `tsc`, and Node `24+` ESM-only release posture.
