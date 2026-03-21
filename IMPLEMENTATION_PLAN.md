# TypeScript App-Server Client Implementation Plan

This document tracks the plan for building a TypeScript client for `codex app-server` based on the upstream README:

- Source of truth: [codex-rs/app-server/README.md](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)

The protocol details in this plan are derived from that README, including:

- JSON-RPC 2.0-style messaging without the `jsonrpc` field on the wire
- Mandatory `initialize` -> `initialized` handshake
- `stdio` as the default/supported transport
- Streaming notifications for turns and items
- Server-initiated requests for approvals, tool calls, and structured input
- Generated TypeScript schema via `codex app-server generate-ts`

## Goals

- Build a reliable TypeScript client for `codex app-server`
- Keep protocol bindings easy to regenerate as upstream evolves
- Separate generated protocol types from handwritten runtime logic
- Support both low-level protocol access and high-level ergonomic APIs
- Use this document as the active execution checklist

## Progress Notes

### 2026-03-21

- Bootstrapped the package with npm-compatible TypeScript and Vitest tooling.
- Added the initial `transport/` module structure and a shared transport contract.
- Implemented a first-pass `stdio` transport for newline-delimited JSON frames.
- Added focused unit coverage for framing, chunked reads, malformed input, and lifecycle gating.
- Aligned the build output layout with the published package entrypoints so `dist/index.js` resolves correctly.
- Git is initialized, and the first transport slice has already gone through review and QA passes.
- Added a first-pass `rpc/` session layer on top of transport with request id generation, pending request tracking, response correlation, notification routing, and incoming server-request routing.
- Enforced the `initialize` -> `initialized` handshake in the RPC session so client-originated methods stay gated until startup completes.
- Added focused unit coverage for request/response matching, initialize-state rules, incoming request routing, transport-close rejection, and protocol-error handling.
- Added a repo-level stdio integration test that exercises a real `codex app-server` initialize handshake and `model/list` request.
- Added committed stable and experimental generated protocol artifacts under `src/generated/` plus matching JSON Schema bundles under `schemas/`.
- Added `bindings:generate` and `bindings:check` scripts that regenerate into temporary directories, normalize generator output for `NodeNext`, and record the `codex` CLI version in `src/generated/manifest.json`.
- Added a handwritten `src/protocol/index.ts` boundary so runtime code can depend on curated protocol exports without reaching into generated files directly.
- Added focused tests for the generation-script import normalization helper and validated the generation flow with `bindings:check`, `typecheck`, `build`, and the existing test suite.
- Added a GitHub Actions workflow that installs the manifest-pinned `codex` CLI version and runs `bindings:check` on pushes to `main` and on pull requests.
- Added a first-pass `client/` layer with an `AppServerClient` wrapper that manages the `initialize` -> `initialized` handshake, exposes typed `model/list`, `skills/list`, and `app/list` helpers, and passes through typed server notifications and requests without forcing callers down to raw RPC primitives.
- Added focused unit coverage for client handshake caching, initialize retry behavior, deferred `initialized` calls, and typed event passthrough, then updated the real stdio integration test to exercise the client surface instead of raw `RpcSession` usage.

## Architectural Direction

The client should be built in layers:

1. `transport/`
   - `stdio` first
   - `websocket` later behind an experimental flag
2. `rpc/`
   - request ids
   - pending request tracking
   - notification routing
   - server-initiated request routing
   - initialize-state enforcement
3. `protocol/`
   - generated protocol bindings
   - thin handwritten adapters and re-exports
4. `client/`
   - ergonomic APIs like `initialize()`, `thread.start()`, `turn.start()`, `command.exec()`, and `fs.readFile()`

## Proposed Repository Layout

```text
src/
  client/
  protocol/
  rpc/
  transport/
  generated/
    stable/
    experimental/
schemas/
  stable/
  experimental/
scripts/
  generate-bindings.ts
  check-bindings.ts
tests/
```

## Guiding Rules

- Do not hand-edit generated bindings
- Keep generated files isolated behind `src/protocol/`
- Support incoming server requests as first-class protocol events
- Prefer stable API support first, then experimental opt-in support
- Build around `stdio` first; add websocket only after the core is solid

## Built-In Binding Regeneration

This is a required part of the implementation, not an afterthought.

### Commands To Support

```bash
codex app-server generate-ts --out src/generated/stable
codex app-server generate-ts --out src/generated/experimental --experimental
codex app-server generate-json-schema --out schemas/stable
codex app-server generate-json-schema --out schemas/experimental --experimental
```

### Required Script Behavior

`scripts/generate-bindings.ts` should:

- generate stable TypeScript bindings
- generate experimental TypeScript bindings
- generate stable JSON Schema output
- generate experimental JSON Schema output
- capture the `codex` version used for generation
- write a small manifest describing the generated artifacts
- fail safely if any generation step errors

`scripts/check-bindings.ts` should:

- regenerate into a temp directory
- compare with committed generated artifacts
- fail CI if bindings are stale

### Suggested Package Scripts

```json
{
  "scripts": {
    "bindings:generate": "tsx scripts/generate-bindings.ts",
    "bindings:check": "tsx scripts/check-bindings.ts",
    "build": "tsup src/index.ts",
    "test": "vitest run"
  }
}
```

## Core Workstreams

### 1. Transport Layer

- [x] Implement newline-delimited JSON transport for `stdio`
- [x] Define a transport interface shared by all transports
- [x] Support clean startup and shutdown
- [x] Handle malformed frames and connection termination cleanly
- [ ] Add websocket transport behind an experimental flag

### 2. RPC Session Layer

- [x] Implement outbound request id generation
- [x] Track pending requests and resolve responses
- [x] Route notifications separately from responses
- [x] Route incoming server-initiated requests
- [x] Enforce `initialize` before any other client call
- [x] Prevent repeated `initialize` on the same connection
- [ ] Add timeout and cancellation support where appropriate

### 3. Generated Protocol Boundary

- [x] Add generated stable bindings under `src/generated/stable`
- [x] Add generated experimental bindings under `src/generated/experimental`
- [x] Create `src/protocol/index.ts` to re-export curated types
- [x] Keep handwritten protocol helpers separate from generated files
- [x] Add a manifest file that records the generator version

### 4. Stable Client API

- [x] Implement `initialize()` and `initialized()`
- [ ] Implement thread APIs needed for normal usage
- [ ] Implement turn APIs needed for normal usage
- [ ] Implement `command/exec*` APIs
- [ ] Implement `fs/*` APIs
- [ ] Implement `account/*` APIs
- [x] Implement `model/list`, `skills/list`, and `app/list`

### 5. Event Streaming

- [ ] Expose raw notification access
- [ ] Expose typed event subscriptions
- [ ] Support turn lifecycle events
- [ ] Support item lifecycle events
- [ ] Support delta events like `item/agentMessage/delta`
- [ ] Support token usage and error events
- [ ] Document event ordering assumptions from the upstream README

### 6. Incoming Requests And Approvals

- [ ] Support `item/commandExecution/requestApproval`
- [ ] Support `item/fileChange/requestApproval`
- [ ] Support `item/permissions/requestApproval`
- [ ] Support `item/tool/call`
- [ ] Support `mcpServer/elicitation/request`
- [ ] Expose pluggable handlers for approval and request flows
- [ ] Ensure responses are sent in the exact shapes expected by the protocol

### 7. Experimental API Support

- [ ] Add connection-level `experimentalApi` opt-in support
- [ ] Gate experimental methods and features in the client surface
- [ ] Add support for experimental bindings alongside stable bindings
- [ ] Add websocket transport only after stable `stdio` support lands
- [ ] Add support for dynamic tools and realtime events later

### 8. Ergonomic Helpers

- [ ] Add high-level helpers for common thread + turn flows
- [ ] Add helper APIs for streamed turn consumption
- [ ] Add helper APIs for approval handling
- [ ] Keep helpers optional so low-level protocol access stays available

### 9. Testing

- [x] Unit test message framing/parsing
- [x] Unit test request/response correlation
- [x] Unit test initialize gating
- [x] Unit test incoming server-request routing
- [ ] Fixture test streamed notification sequences
- [x] Integration test against a real `codex app-server --listen stdio://`
- [x] Add CI coverage for stale binding detection

### 10. Packaging And Release

- [ ] Define the public package entrypoints
- [ ] Decide ESM-only vs dual ESM/CJS support
- [ ] Add API docs and examples
- [ ] Add a changelog/release process
- [ ] Publish once the stable surface is proven

## Recommended Delivery Phases

## Phase 1: Stable Core

- [x] Scaffold package structure
- [x] Implement `stdio` transport
- [x] Implement RPC session manager
- [x] Add stable bindings and regeneration scripts
- [x] Implement initialize flow
- [ ] Implement stable methods for thread, turn, command, and fs APIs
- [ ] Implement event streaming
- [ ] Implement approval handling
- [ ] Add unit tests and basic integration tests

## Phase 2: Experimental Support

- [ ] Add experimental bindings
- [ ] Add runtime `experimentalApi` opt-in
- [ ] Add websocket transport
- [ ] Add dynamic tool support
- [ ] Add realtime event support

## Phase 3: Developer Experience And Hardening

- [ ] Add ergonomic helper APIs
- [ ] Improve docs and examples
- [x] Add stronger CI validation around generated bindings
- [ ] Finalize release packaging
- [ ] Publish the package

## Open Decisions

- [ ] Confirm package manager (`pnpm`, `npm`, or `yarn`)
- [ ] Confirm build tool (`tsup`, `unbuild`, or alternative)
- [ ] Confirm runtime target(s) and Node version support
- [ ] Confirm whether websocket support belongs in v1 or post-v1
- [ ] Confirm whether experimental APIs should ship in the same package surface or a submodule

## Notes

- The safest long-term design is generated schema at the edges and handwritten runtime logic in the middle.
- The README makes `stdio` the best default target for the first implementation.
- Approval and incoming request handling are mandatory parts of a real client, not optional extras.
- The binding regeneration workflow should be part of the normal development loop so protocol drift is caught early.
- Current implementation assumes npm because it is available locally in this workspace; `pnpm` and `yarn` are not installed here today.
