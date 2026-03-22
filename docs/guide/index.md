# Guide

`codex-app-server-client` is a TypeScript client for `codex app-server`. It gives applications a typed way to:

- connect to a live app-server process over `stdio`
- complete the required `initialize` -> `initialized` handshake
- start threads and turns
- consume streamed turn and item events
- handle approval and server-request callbacks

The package is structured in layers:

- `transport/` manages newline-delimited JSON over `stdio`
- `rpc/` handles request ids, responses, notifications, and server-initiated requests
- `protocol/` exposes curated generated bindings
- `client/` provides higher-level helpers for common thread, turn, and approval flows

This guide shows the normal client flow: connect, initialize, start a thread, run a turn, stream events, and respond to approvals.

## Requirements

- Node.js `24+`
- A local `codex` CLI if you want to connect to a real app-server process
- An ESM-friendly project, since the package publishes a root-only ESM entrypoint and expects `import` / `export` syntax instead of CommonJS `require()`

For live integration work, the server process is typically started with:

```bash
codex app-server --listen stdio://
```

## Install

The package is not published to npm yet, so current consumption is from a git checkout or a local path.

For local development in this repository:

```bash
npm ci
```

For use from another project before the first npm release:

```bash
cd /path/to/codex-client
npm ci

cd /path/to/your-project
npm install /path/to/codex-client
```

The package runs `prepare` during install, so the built `dist/` output is generated automatically once the checkout has its toolchain installed.

Only the root package import is supported. Deep imports and subpath imports are intentionally not part of the public API, and CommonJS `require()` is not a supported consumption mode.

## Start The App-Server

The usual setup is to spawn `codex app-server` as a child process and connect the client to its stdio streams.

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
```

This keeps the transport boundary explicit and makes it easy to drop to lower-level APIs later if you need raw protocol access.

## Initialize A Client

Every connection must perform the protocol handshake in this order:

1. `initialize`
2. `initialized`

`client.initialize()` handles both steps by default.

```ts
await client.initialize({
  clientInfo: {
    name: "example-client",
    title: "Example Client",
    version: "0.0.1"
  },
  capabilities: {
    optOutNotificationMethods: []
  }
});
```

After initialization, you can call higher-level methods like `modelList()`, `thread.start()`, and `turn.run()`.

```ts
const models = await client.modelList();

console.log(models.data.map((model) => model.id));
```

## Run Threads And Turns

The turn and thread APIs include both direct request helpers and higher-level composition helpers.

### Start A Thread

```ts
const thread = await client.thread.start({
  cwd: process.cwd(),
  experimentalRawEvents: false,
  persistExtendedHistory: false
});

console.log(thread.thread.id);
```

### Run A Turn To Completion

`turn.run()` starts a turn, listens for the matching lifecycle notifications, reconstructs streamed agent-message text, and resolves after the terminal `turn/completed` event arrives.

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

console.log(agentMessage?.type);
```

### Start A Thread And First Turn Together

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

The helper stays intentionally thin. It returns the underlying `thread/start` and `turn/start` outputs instead of hiding them behind a custom abstraction.

## Stream Events

After a turn starts, the server becomes notification-driven. The documented lifecycle this client is built around is:

1. `turn/start` returns an initial snapshot
2. `turn/started` announces execution
3. Each streamed item emits `item/started`
4. Zero or more item-specific delta or progress notifications arrive
5. `item/completed` closes each item
6. `turn/completed` closes the turn

You can subscribe to typed notifications directly:

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

If you need protocol-fidelity access without narrowing to generated methods, use `client.onNotification()` to receive raw RPC notifications.

## Handle Approvals And Server Requests

`codex app-server` can send server-initiated requests for approvals, tool calls, and structured input. The client supports these as first-class typed callbacks.

For approval-heavy flows, `handleApprovals()` wires the common approval methods into one object:

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

For lower-level control, register a handler for the exact server request method:

```ts
client.handleRequest("item/tool/call", async () => {
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

This keeps approval handling typed while still leaving room for lower-level request control when your application needs it.

## Drop To Lower-Level APIs

If `AppServerClient` is more abstraction than you want, you can work at a lower level:

- Use `StdioTransport` when you only need framed JSON transport
- Use `RpcSession` when you want request/response routing and initialize-state enforcement without the ergonomic helpers
- Use curated protocol exports from `protocol/` when you need protocol-shaped types in your own abstractions

That split is useful when building your own orchestration layer, debugging server behavior, or experimenting with methods that are not yet wrapped by the ergonomic client.

## Bindings And Schemas

Generated TypeScript bindings live under `src/generated/`, and committed JSON Schemas live under `schemas/`.

Regenerate and verify them with:

```bash
npm run bindings:generate
npm run bindings:check
```

Handwritten runtime code should depend on the curated `src/protocol/` boundary instead of importing generated files directly.

## Local Development

Useful commands while working in this repository:

```bash
npm run typecheck
npm run build
npm test
npm run docs:dev
npm run docs:build
```

The docs live in `docs/`, build with VitePress, and publish from GitHub Pages.
