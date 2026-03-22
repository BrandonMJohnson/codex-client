# codex-app-server-client

TypeScript client library for [`codex app-server`](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md).

The package exposes a single supported public entrypoint: the root package import `codex-app-server-client`. That root import provides a typed, layered client surface:

- `transport/` for newline-delimited JSON over `stdio`
- `rpc/` for request/response correlation and initialize-state enforcement
- `protocol/` for curated generated protocol bindings
- `client/` for ergonomic APIs like `thread.start()`, `turn.run()`, and approval handling

Subpath imports are intentionally not part of the public contract.

## Documentation

- Published docs: [brandonmjohnson.github.io/codex-client](https://brandonmjohnson.github.io/codex-client/)
- Guide: [Guide](https://brandonmjohnson.github.io/codex-client/guide/)
- API overview: [API Surface](https://brandonmjohnson.github.io/codex-client/reference/)
- Client reference: [AppServerClient](https://brandonmjohnson.github.io/codex-client/reference/app-server-client)

## Status

The project is under active development. The stable `stdio` client surface is implemented and covered by unit and live integration tests.

The active roadmap lives in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

## Requirements

- Node.js `24+`
- A local `codex` CLI when you want to run against a real app-server process

## Install

The package is ESM-only, exposes only the root package entrypoint, and is not published to npm yet. Consumers should use `import` / `export` syntax; CommonJS `require()` is intentionally unsupported.

For local development from this checkout:

```bash
npm ci
```

For consumption from another project before the first npm release:

```bash
cd /path/to/codex-client
npm ci

cd /path/to/your-project
npm install /path/to/codex-client
```

## Validation

```bash
npm run typecheck
npm run build
npm test
npm run docs:build
```
