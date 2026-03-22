# AppServerClient

`AppServerClient` is the main client API exposed by the package. It manages the app-server connection lifecycle, exposes typed request helpers, and provides event and server-request hooks for interactive flows.

## Construct A Client

Most applications create a client from `StdioTransport`:

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

const client = new AppServerClient({
  transport,
  defaultRequestTimeoutMs: 30_000
});
```

Constructor options:

- `transport`: the transport implementation to use
- `requestIdFactory`: optional custom request id generator
- `defaultRequestTimeoutMs`: optional default timeout applied by the underlying RPC session

## Lifecycle

### `client.state`

Exposes the underlying transport state.

```ts
console.log(client.state);
```

### `client.initializationState`

Exposes the RPC session initialization lifecycle state.

```ts
console.log(client.initializationState);
```

### `client.start()`

Starts the underlying session without sending `initialize`.

Use this when you want explicit control over when the transport starts.

```ts
await client.start();
```

### `client.initialize(params, options?)`

Sends `initialize`, caches the response, and by default follows it with `initialized`.

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

Important behavior:

- repeated calls reuse the first successful initialize response
- the client rejects attempts to reuse the same session with different initialize params
- `options.sendInitialized` defaults to `true`
- `options.request` forwards request options such as timeouts and abort signals

If you need to delay the second handshake step:

```ts
await client.initialize(
  {
    clientInfo: {
      name: "example-client",
      title: "Example Client",
      version: "0.0.1"
    },
    capabilities: null
  },
  {
    sendInitialized: false
  }
);

await client.initialized();
```

### `client.initialized()`

Sends the protocol `initialized` notification if it has not already been sent.

```ts
await client.initialized();
```

### `client.close()`

Closes the underlying session and transport.

```ts
await client.close();
```

## Shared Request Options

Most request helpers accept `AppServerClientRequestOptions`, which forward to the underlying RPC layer.

Common uses:

- `timeoutMs` for per-request timeouts
- `signal` for cancellation via `AbortController`

```ts
const controller = new AbortController();

const models = await client.modelList(
  {},
  {
    timeoutMs: 5_000,
    signal: controller.signal
  }
);
```

## Catalog Methods

### `client.appList(params?, options?)`

Lists app metadata exposed by the server.

```ts
const apps = await client.appList();

console.log(apps.data.map((app) => app.name));
```

### `client.modelList(params?, options?)`

Lists available models.

```ts
const models = await client.modelList();

console.log(models.data.map((model) => model.id));
```

### `client.skillsList(params?, options?)`

Lists available skills for the current context.

```ts
const skills = await client.skillsList({
  cwd: process.cwd()
});

console.log(skills.skills.map((skill) => skill.name));
```

## `client.thread`

Thread helpers cover thread creation, inspection, resumption, and the combined thread-plus-first-turn flow.

### `client.thread.start(params, options?)`

Starts a new thread.

```ts
const startedThread = await client.thread.start({
  cwd: process.cwd(),
  experimentalRawEvents: false,
  persistExtendedHistory: false
});

console.log(startedThread.thread.id);
```

### `client.thread.resume(params, options?)`

Resumes a persisted thread from stored rollout history.

```ts
const resumed = await client.thread.resume({
  threadId: "thread_123"
});
```

Freshly started threads are not always resumable immediately. A thread generally becomes resumable only after the server has materialized the backing rollout history.

### `client.thread.read(params, options?)`

Reads one thread by id.

```ts
const thread = await client.thread.read({
  threadId: "thread_123"
});

console.log(thread.thread.status);
```

### `client.thread.list(params?, options?)`

Lists known threads.

```ts
const threads = await client.thread.list({
  limit: 20
});

console.log(threads.data.length);
```

### `client.thread.loadedList(params?, options?)`

Lists currently loaded threads on the active server process.

```ts
const loadedThreads = await client.thread.loadedList();
```

### `client.thread.run(params, options?)`

Starts a thread and immediately runs its first turn.

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

Important behavior:

- the helper fills `threadId` into the initial turn automatically
- if the thread starts successfully but the initial turn fails, the helper throws `AppServerClientThreadRunError`
- `AppServerClientThreadRunError.thread` preserves the created thread response so callers can recover

## `client.turn`

Turn helpers cover direct turn requests and the streamed helper that waits for completion.

### `client.turn.start(params, options?)`

Starts a turn on an existing thread.

```ts
const startedTurn = await client.turn.start({
  threadId: "thread_123",
  effort: "low",
  input: [
    {
      type: "text",
      text: "Summarize this repository in one sentence.",
      text_elements: []
    }
  ]
});

console.log(startedTurn.turn.id);
```

This returns the immediate `turn/start` response. Completion arrives later through notifications.

### `client.turn.steer(params, options?)`

Adds more user input to an active turn.

```ts
await client.turn.steer({
  threadId: "thread_123",
  turnId: "turn_456",
  input: [
    {
      type: "text",
      text: "Now make it shorter.",
      text_elements: []
    }
  ]
});
```

### `client.turn.interrupt(params, options?)`

Requests that the server stop an active turn.

```ts
await client.turn.interrupt({
  threadId: "thread_123",
  turnId: "turn_456"
});
```

The final interrupted state still arrives asynchronously through later notifications or a later thread read.

### `client.turn.run(params, options?)`

Starts a turn and collects its matching lifecycle notifications until `turn/completed`.

```ts
const run = await client.turn.run({
  threadId: "thread_123",
  effort: "low",
  input: [
    {
      type: "text",
      text: "Reply with exactly helper-check.",
      text_elements: []
    }
  ]
});

console.log(run.start.turn.id);
console.log(run.completed.params.turn.status);
console.log(run.completedItems.length);
console.log(run.agentMessageDeltas);
```

Returned data includes:

- `start`: the immediate `turn/start` response
- `started`: the matching `turn/started` event when that method is not suppressed
- `completed`: the terminal `turn/completed` event
- `events`: all collected lifecycle events in arrival order
- `completedItems`: completed items in arrival order
- `agentMessageDeltas`: reconstructed `item/agentMessage/delta` text by item id

Helper options:

- `request`: forwarded to the underlying `turn/start` RPC call
- `completionTimeoutMs`: timeout for waiting on `turn/completed`
- `signal`: abort signal for the overall helper
- `onEvent`: callback for each collected lifecycle event

```ts
const run = await client.turn.run(
  {
    threadId: "thread_123",
    effort: "low",
    input: [
      {
        type: "text",
        text: "Stream a short answer.",
        text_elements: []
      }
    ]
  },
  {
    completionTimeoutMs: 10_000,
    onEvent(event) {
      console.log(event.method);
    }
  }
);
```

## `client.command`

Standalone command helpers execute processes outside thread turn execution.

### `client.command.exec(params, options?)`

Executes a command.

```ts
const result = await client.command.exec({
  command: ["pwd"],
  cwd: process.cwd(),
  waitForExit: true
});

console.log(result.exitCode);
```

If you need follow-up writes, PTY resizing, termination, or streaming output, start the command with a stable `processId`.

```ts
await client.command.exec({
  processId: "shell-1",
  command: ["bash"],
  cwd: process.cwd(),
  tty: true,
  waitForExit: false
});
```

### `client.command.write(params, options?)`

Writes base64-encoded stdin bytes to a running command session.

```ts
await client.command.write({
  processId: "shell-1",
  inputBase64: Buffer.from("echo ready\n").toString("base64")
});
```

### `client.command.resize(params, options?)`

Resizes the PTY for a running command started with `tty: true`.

```ts
await client.command.resize({
  processId: "shell-1",
  cols: 120,
  rows: 40
});
```

### `client.command.terminate(params, options?)`

Terminates a running command session.

```ts
await client.command.terminate({
  processId: "shell-1"
});
```

## `client.fs`

Filesystem helpers operate on the host filesystem exposed through app-server.

### `client.fs.readFile(params, options?)`

Reads a file as base64.

```ts
const file = await client.fs.readFile({
  path: "/tmp/example.txt"
});

const text = Buffer.from(file.contentBase64, "base64").toString("utf8");
console.log(text);
```

### `client.fs.writeFile(params, options?)`

Writes a full base64 payload to a file.

```ts
await client.fs.writeFile({
  path: "/tmp/example.txt",
  contentBase64: Buffer.from("hello\n").toString("base64")
});
```

### `client.fs.createDirectory(params, options?)`

Creates a directory.

```ts
await client.fs.createDirectory({
  path: "/tmp/example-dir",
  recursive: true
});
```

### `client.fs.getMetadata(params, options?)`

Reads metadata about a file or directory.

```ts
const metadata = await client.fs.getMetadata({
  path: "/tmp/example.txt"
});

console.log(metadata.kind);
```

### `client.fs.readDirectory(params, options?)`

Lists a directory's direct children.

```ts
const directory = await client.fs.readDirectory({
  path: "/tmp"
});

console.log(directory.entries.map((entry) => entry.name));
```

### `client.fs.remove(params, options?)`

Removes a file or directory tree.

```ts
await client.fs.remove({
  path: "/tmp/example-dir",
  recursive: true
});
```

### `client.fs.copy(params, options?)`

Copies a file or directory tree.

```ts
await client.fs.copy({
  sourcePath: "/tmp/example.txt",
  destinationPath: "/tmp/example-copy.txt"
});
```

## `client.account`

Account helpers cover the active auth session, login flows, and rate-limit snapshots.

### `client.account.read(params?, options?)`

Reads the current account state. The helper defaults `refreshToken` to `false`.

```ts
const account = await client.account.read();

console.log(account.account?.email);
```

If you want to opt into refresh work:

```ts
await client.account.read({
  refreshToken: true
});
```

### `client.account.loginStart(params, options?)`

Starts a login flow.

```ts
const login = await client.account.loginStart({
  method: "chatgpt"
});
```

### `client.account.loginCancel(params, options?)`

Cancels a previously started browser login flow.

```ts
await client.account.loginCancel({
  loginId: "login_123"
});
```

### `client.account.logout(options?)`

Clears the active account session from the server process.

```ts
await client.account.logout();
```

### `client.account.rateLimitsRead(options?)`

Reads the current rate-limit snapshot.

```ts
const rateLimits = await client.account.rateLimitsRead();

console.log(rateLimits.snapshots.length);
```

## Notifications, Requests, And Errors

### `client.onNotification(listener)`

Subscribes to raw RPC notifications without narrowing them to known generated methods.

```ts
const stop = client.onNotification((notification) => {
  console.log(notification.method);
});

stop();
```

### `client.onEvent(method, listener)`

Subscribes to one typed generated server notification method.

```ts
const stopDelta = client.onEvent("item/agentMessage/delta", (event) => {
  process.stdout.write(event.params.delta);
});
```

Use this when you want typed event payloads without handling unrelated methods yourself.

### `client.onRequest(listener)`

Subscribes to raw inbound server requests.

```ts
const stop = client.onRequest((request) => {
  console.log(request.method);
});
```

### `client.onServerRequest(method, listener)`

Subscribes to one typed server request method while leaving response control in your hands.

```ts
const stop = client.onServerRequest(
  "item/tool/call",
  async (request) => {
    await request.respond({
      contentItems: [
        {
          type: "inputText",
          text: "Handled manually."
        }
      ],
      success: true
    });
  }
);
```

The wrapper prevents multiple responses to the same inbound request.

### `client.handleRequest(method, handler)`

Registers one auto-response handler for a specific typed server request method.

```ts
const stop = client.handleRequest("item/tool/call", async () => {
  return {
    contentItems: [
      {
        type: "inputText",
        text: "Handled automatically."
      }
    ],
    success: true
  };
});
```

Important behavior:

- only one auto-handler can be active per method at a time
- thrown errors are translated into JSON-RPC internal error responses
- the returned cleanup function unregisters the handler

### `client.handleApprovals(handlers)`

Registers typed handlers for approval-oriented server request methods:

- `applyPatchApproval`
- `execCommandApproval`
- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/permissions/requestApproval`

```ts
const stopApprovals = client.handleApprovals({
  execCommandApproval: () => ({ decision: "denied" }),
  "item/fileChange/requestApproval": () => ({ decision: "decline" }),
  "item/permissions/requestApproval": () => ({
    permissions: {},
    scope: "turn"
  })
});
```

Like `handleRequest()`, approval handlers are auto-response handlers and must return the exact protocol response for their method.

### `client.onError(listener)`

Subscribes to session-level errors.

```ts
const stop = client.onError((error) => {
  console.error(error);
});
```

### `client.onClose(listener)`

Subscribes to session closure.

```ts
const stop = client.onClose((error) => {
  console.log("client closed", error);
});
```

## Related Exported Helper Types

The package also exports client-side helper types and result shapes alongside `AppServerClient`, including:

- `AppServerClientRequestOptions`
- `AppServerClientInitializeOptions`
- `AppServerClientTurnRunOptions`
- `AppServerClientTurnRunResult`
- `AppServerClientThreadRunParams`
- `AppServerClientThreadRunOptions`
- `AppServerClientThreadRunResult`
- `AppServerClientThreadRunError`
- `AppServerClientApprovalHandlers`

These are useful when you are building your own wrappers, orchestration helpers, or strongly typed application code around the client.
