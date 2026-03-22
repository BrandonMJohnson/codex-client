# API Surface

The package exports four main layers from the top-level entrypoint:

## `AppServerClient`

The ergonomic surface for most consumers. It handles the required initialize handshake, exposes typed methods for common protocol endpoints, and includes higher-level helpers for streamed turn execution and approval registration.

Current high-level areas include:

- `client.initialize()`
- `client.modelList()`, `client.skillsList()`, and `client.appList()`
- `client.thread.*`
- `client.turn.*`
- `client.command.*`
- `client.fs.*`
- `client.account.*`
- `client.onEvent()`, `client.onNotification()`, `client.onServerRequest()`, and `client.handleRequest()`
- `client.handleApprovals()`

## `StdioTransport`

The transport implementation for newline-delimited JSON frames over stdio. Use this when you want explicit control over process lifecycle and framing, or when you want to compose your own client stack on top.

## `RpcSession`

The middle layer between transport and client ergonomics. It tracks outbound request ids, correlates responses, routes notifications separately from responses, and enforces the `initialize` then `initialized` connection lifecycle.

## Protocol Exports

Curated protocol types are re-exported from the package entrypoint so application code can stay aligned with the generated schemas without importing from `src/generated/` directly.

For the detailed source of truth on protocol behavior, see:

- the upstream [`codex app-server` README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- the committed generated schemas under `schemas/`
- the runtime implementation in this repository
