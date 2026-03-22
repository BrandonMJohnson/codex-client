# codex-app-server-client

TypeScript client library for [`codex app-server`](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md).

It provides a typed, layered client for the app-server protocol:

- `transport/` for newline-delimited JSON over `stdio`
- `rpc/` for request/response correlation and initialize-state enforcement
- `protocol/` for curated generated protocol bindings
- `client/` for ergonomic high-level APIs like `thread.start()`, `turn.run()`, and approval handling

The library is designed to keep low-level protocol access available while still making common client flows pleasant to use.

## Protocol Source Of Truth

This client is implemented against the upstream [`codex app-server` README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md) and the generated schemas produced by `codex app-server generate-ts` / `generate-json-schema`.

Important upstream constraints this client follows:

- The wire protocol is JSON-RPC 2.0-style, with the `jsonrpc` field omitted on the wire.
- Each connection must perform the `initialize` -> `initialized` handshake before any other client request.
- `stdio` is the default supported transport; websocket is documented upstream as experimental and unsupported.
- Turns become notification-driven after `turn/start`, with `turn/completed` as the terminal turn event.
- The server can reject saturated request ingress with retryable JSON-RPC error code `-32001`.

## Status

The project is under active development, and the stable `stdio` client surface is already implemented and covered by unit and live integration tests.

Current highlights:

- Typed stable client APIs for threads, turns, commands, filesystem access, accounts, models, apps, and skills
- Raw notification access plus typed event subscriptions
- Typed handling for server-initiated approval and request flows
- High-level helpers for `turn.run()`, `thread.run()`, and approval registration
- Generated stable and experimental protocol bindings kept separate from handwritten runtime code

The active roadmap lives in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

## Guide

The repository now includes a VitePress guide site so the project can publish framework-style documentation instead of relying only on the README.

- Local docs entrypoint: [docs/index.md](./docs/index.md)
- Long-form guide: [docs/guide/index.md](./docs/guide/index.md)
- API surface reference: [docs/reference/index.md](./docs/reference/index.md)

Useful docs commands:

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
```

The `Docs` GitHub Actions workflow publishes the built site to GitHub Pages from `main`.

## Install

The package is ESM-only and currently targets Node.js `>=24`.

The package is not published to npm yet.

For local development from a checkout:

```bash
npm ci
```

For consumption from another project before the first npm release, install from a git URL, or from a local path that has already been bootstrapped with `npm ci`. The package runs `prepare` during install so the built `dist/` entrypoint is generated automatically once the source checkout has the build toolchain available.

```bash
cd /path/to/codex-client
npm ci
npm install /path/to/codex-client
```

## Requirements

- Node.js `24+`
- A locally available `codex` CLI when you want to run against a real app-server process

The integration tests expect:

```bash
codex app-server --listen stdio://
```

## Quick Start

The main entrypoint exports the ergonomic client, transport layer, RPC utilities, and curated protocol types.

```ts
import { spawn } from "node:child_process";

import { AppServerClient, StdioTransport } from "codex-app-server-client";

const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "inherit"]
});

const transport = new StdioTransport({
  input: child.stdout,
  output: child.stdin
});

const client = new AppServerClient({ transport });

await client.initialize({
  clientInfo: {
    name: "example-client",
    title: "Example Client",
    version: "0.0.1"
  },
  capabilities: null
});

const models = await client.modelList();
console.log(models.data.map((model) => model.id));

await client.close();
```

`client.initialize()` performs the required `initialize` -> `initialized` handshake by default, so most callers do not need to send `initialized()` manually.

## Common Usage

### Start A Thread

```ts
const thread = await client.thread.start({
  cwd: process.cwd(),
  experimentalRawEvents: false,
  persistExtendedHistory: false
});

console.log(thread.thread.id);
```

### Run A Turn And Wait For Completion

```ts
const run = await client.turn.run({
  threadId: thread.thread.id,
  effort: "low",
  input: [
    {
      type: "text",
      text: "Reply with exactly helper-check.",
      text_elements: []
    }
  ]
});

console.log(run.completed.params.turn.status);

const agentMessage = run.completedItems.find(
  (item) => item.type === "agentMessage"
);
```

`turn.run()` starts the turn, collects matching lifecycle notifications, and resolves after the terminal `turn/completed` notification arrives. The result includes:

- The immediate `turn/start` response
- The ordered event log
- The terminal `turn/completed` notification
- Completed items in arrival order
- Reconstructed `item/agentMessage/delta` text keyed by item id

### Start A Thread And Initial Turn Together

```ts
const run = await client.thread.run({
  thread: {
    cwd: process.cwd(),
    experimentalRawEvents: false,
    persistExtendedHistory: false
  },
  turn: {
    effort: "low",
    input: [
      {
        type: "text",
        text: "Reply with exactly ready.",
        text_elements: []
      }
    ]
  }
});

console.log(run.thread.thread.id);
console.log(run.turn.completed.params.turn.status);
```

This helper is intentionally thin. It preserves both underlying responses so callers still have access to the real `thread/start` and `turn/start` results.

### Subscribe To Typed Events

```ts
const stopTurnStarted = client.onEvent("turn/started", (event) => {
  console.log("turn started", event.params.turn.id);
});

const stopDelta = client.onEvent("item/agentMessage/delta", (event) => {
  process.stdout.write(event.params.delta);
});

const stopTurnCompleted = client.onEvent("turn/completed", (event) => {
  console.log("turn completed", event.params.turn.status);
});

// Later:
stopTurnStarted();
stopDelta();
stopTurnCompleted();
```

If you need full protocol fidelity, `client.onNotification()` exposes raw RPC notifications without narrowing them to known generated methods.

### Handle Approvals And Other Server Requests

For approval-style workflows, `handleApprovals()` wires the common request methods into one typed object:

```ts
const stopApprovals = client.handleApprovals({
  applyPatchApproval: () => ({ decision: "denied" }),
  execCommandApproval: () => ({ decision: "denied" }),
  "item/commandExecution/requestApproval": () => ({ decision: "decline" }),
  "item/fileChange/requestApproval": () => ({ decision: "decline" }),
  "item/permissions/requestApproval": () => ({
    permissions: {},
    scope: "turn"
  })
});

// Later:
stopApprovals();
```

For lower-level control, use `onServerRequest()` or `handleRequest()` directly:

```ts
client.handleRequest("item/tool/call", async (request) => {
  return {
    contentItems: [
      {
        type: "inputText",
        text: "Tool call handled by the client."
      }
    ],
    success: true
  };
});
```

## Event Model

Once a turn starts, app-server becomes notification-driven.

The documented lifecycle this client is built around is:

1. `turn/start` returns an initial snapshot
2. `turn/started` announces that execution has begun
3. Each streamed item emits `item/started`
4. Zero or more item-specific delta/progress notifications arrive
5. `item/completed` closes each item
6. `turn/completed` closes the turn

For agent-message text, reconstruct append-only output by concatenating `item/agentMessage/delta` notifications in arrival order. The `turn.run()` helper already does this for you.

Per-connection notification suppression through `initialize.capabilities.optOutNotificationMethods` can remove intermediate event classes. Higher-level helpers in this library tolerate missing non-terminal events, but they still rely on `turn/completed` to know a run is finished.

## API Surface

The public top-level exports currently include:

- `AppServerClient` for the ergonomic client surface
- `StdioTransport` and transport contracts
- `RpcSession` and RPC-layer errors/types
- Curated protocol types re-exported from `src/protocol/`

The main client exposes:

- `initialize()` and `initialized()`
- `modelList()`, `skillsList()`, `appList()`
- `thread.start()`, `thread.resume()`, `thread.read()`, `thread.list()`, `thread.loadedList()`, `thread.run()`
- `turn.start()`, `turn.steer()`, `turn.interrupt()`, `turn.run()`
- `command.exec()`, `command.write()`, `command.resize()`, `command.terminate()`
- `fs.readFile()`, `fs.writeFile()`, `fs.createDirectory()`, `fs.getMetadata()`, `fs.readDirectory()`, `fs.remove()`, `fs.copy()`
- `account.read()`, `account.loginStart()`, `account.loginCancel()`, `account.logout()`, `account.rateLimitsRead()`
- `onNotification()`, `onEvent()`, `onRequest()`, `onServerRequest()`, `handleRequest()`, `handleApprovals()`

## Development

Install dependencies:

```bash
npm ci
```

Run the main validation commands:

```bash
npm run typecheck
npm run build
npm test
npm run bindings:check
```

Run live stdio integration coverage when `codex` is available locally:

```bash
npm run test:integration
```

Run the opt-in logout integration only when you intentionally want the test to sign out the current local Codex session:

```bash
CODEX_CLIENT_ALLOW_LIVE_LOGOUT_TEST=1 npm test -- --run tests/integration/appServerStdio.test.ts -t "logs out the current account"
```

## Bindings

Protocol bindings are generated and committed on purpose.

- Handwritten runtime code lives under `src/client/`, `src/rpc/`, `src/transport/`, and `src/protocol/`
- Generated TypeScript bindings live under `src/generated/`
- Generated JSON Schemas live under `schemas/` in the repository for development and regeneration checks; they are not currently part of the published package surface

Useful commands:

```bash
npm run bindings:generate
npm run bindings:check
```

Do not hand-edit generated bindings.

## Contributing

Repository-specific contributor guidance lives in:

- [AGENTS.md](./AGENTS.md)
- [CODE_REVIEW_GUIDANCE.md](./CODE_REVIEW_GUIDANCE.md)
- [QA_GUIDANCE.md](./QA_GUIDANCE.md)
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

Workflow expectations for this repository include:

- Start work from an up-to-date `main`
- Keep changes small and reviewable
- Validate locally
- Run sub-agent code review and QA for meaningful changes
- Keep generated bindings and handwritten runtime code clearly separated

## License

MIT
