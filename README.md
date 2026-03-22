# codex-app-server-client

TypeScript client library for [`codex app-server`](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md).

The package provides a typed, layered client surface:

- `transport/` for newline-delimited JSON over `stdio`
- `rpc/` for request/response correlation and initialize-state enforcement
- `protocol/` for curated generated protocol bindings
- `client/` for ergonomic APIs like `thread.start()`, `turn.run()`, and approval handling

## Documentation

The detailed documentation lives in the docs site rather than this README.

- Guide entrypoint: [docs/index.md](./docs/index.md)
- Long-form guide: [docs/guide/index.md](./docs/guide/index.md)
- API overview: [docs/reference/index.md](./docs/reference/index.md)
- Detailed `AppServerClient` reference: [docs/reference/app-server-client.md](./docs/reference/app-server-client.md)

Useful docs commands:

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
```

The `Docs` GitHub Actions workflow publishes the site to GitHub Pages from `main`.

## Status

The project is under active development. The stable `stdio` client surface is implemented and covered by unit and live integration tests.

The active roadmap lives in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

## Requirements

- Node.js `24+`
- A local `codex` CLI when you want to run against a real app-server process

## Install

The package is ESM-only and not published to npm yet.

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
