# API Surface

The package exposes four layers from the top-level entrypoint so you can choose the level of abstraction that fits your application.

## `AppServerClient`

Most consumers should start here. `AppServerClient` handles the initialize lifecycle, exposes typed request helpers, and includes higher-level helpers for streamed turns and approval flows.

The detailed reference lives on the dedicated page:

- [AppServerClient reference](/reference/app-server-client)

That page covers:

- lifecycle methods like `start()`, `initialize()`, `initialized()`, and `close()`
- catalog methods like `appList()`, `modelList()`, and `skillsList()`
- the `thread`, `turn`, `command`, `fs`, and `account` namespaces
- event, request, approval, error, and close subscriptions
- streamed helper results such as `turn.run()` and `thread.run()`

## `StdioTransport`

The newline-delimited JSON transport for stdio. Use this when you want explicit process and stream control or when you are composing your own client stack.

## `RpcSession`

The layer between transport and `AppServerClient`. It tracks request ids, correlates responses, routes notifications, routes server-initiated requests, and enforces the initialize lifecycle.

## Protocol Exports

Curated protocol types are re-exported from the package entrypoint so applications can stay aligned with the generated schemas without importing from `src/generated/` directly.

For the detailed source of truth on protocol behavior, see:

- the upstream [`codex app-server` README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- the committed generated schemas under `schemas/`
- the runtime implementation in this repository
