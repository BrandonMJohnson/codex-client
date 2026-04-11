# API Surface

The package exposes a single supported public entrypoint at the root import. That entrypoint re-exports four layers so you can choose the level of abstraction that fits your application.

## `AppServerClient`

Most consumers should start here. `AppServerClient` handles the initialize lifecycle, exposes typed request helpers, and includes higher-level helpers for streamed turns and approval flows, including the prompt shapes used before mutating app or MCP tool calls can continue.

The detailed reference lives on the dedicated page:

- [AppServerClient reference](/reference/app-server-client)

That page covers:

- lifecycle methods like `start()`, `initialize()`, `initialized()`, and `close()`
- catalog methods like `appList()`, `modelList()`, and `skillsList()`
- the `thread`, `turn`, `command`, `fs`, and `account` namespaces
- event, request, approval, error, and close subscriptions, including the normalized `handleApprovalRequests()` helper
- streamed helper results such as `turn.run()` and `thread.run()`
- `experimentalApi` usage for side-effecting app and MCP tool flows

## `StdioTransport`

The newline-delimited JSON transport for stdio. Use this when you want explicit process and stream control or when you are composing your own client stack.

## `RpcSession`

The layer between transport and `AppServerClient`. It tracks request ids, correlates responses, routes notifications, routes server-initiated requests, and enforces the initialize lifecycle.

## Protocol Exports

Curated protocol types are re-exported from the root package entrypoint so applications can stay aligned with the generated schemas without importing from `src/generated/` directly.

Subpath imports are intentionally unsupported.

For the detailed source of truth on protocol behavior, see:

- the upstream [`codex app-server` README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- the committed generated schemas under `schemas/`
- the runtime implementation in this repository
