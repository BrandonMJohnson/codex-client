# Changelog

All notable changes to `codex-app-server-client` should be recorded here.

The repository follows a lightweight Keep a Changelog style:

- add user-visible notes under `Unreleased` while work is in progress
- move those notes into a dated release section before tagging the release commit
- keep release notes focused on observable behavior, docs, and packaging changes

## Unreleased

Add short bullet points here before each release.

## 0.1.5 - 2026-04-11

- Added a normalized approval API so clients can handle approval-style app-server prompts through one code path while keeping the lower-level per-method approval hooks available when needed.
- Expanded approval handling and docs for mutating app and MCP tool calls, including real coverage for the Linear side-effect approval flow.
- Refreshed the committed stable and experimental generated bindings and JSON schemas against the current `codex` CLI.
- Updated the bindings generation/check scripts to normalize trailing whitespace in generated TypeScript output so regeneration and stale-checking stay in sync.
- Removed deprecated explicit `false` TypeScript interop settings that TypeScript 6 now flags during the build and bindings-check flows.

## 0.1.4 - 2026-03-27

- Added a zero-config `createClient()` factory that starts a local `codex app-server`, completes the required initialize handshake automatically, and returns a ready-to-use managed client.
- Kept the lower-level `AppServerClient` plus transport-oriented construction path intact while making the common local startup flow much simpler.
- Defaulted the ergonomic `thread.start()` and `thread.run()` helpers to use `experimentalRawEvents: false` and `persistExtendedHistory: false` unless callers opt in explicitly.
- Hardened managed-client startup and shutdown handling for child-process failures and cleanup escalation paths.
- Updated the guide, API reference, README, and implementation plan to document the new simple path alongside the unchanged advanced path.

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
