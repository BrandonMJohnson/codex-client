# codex-client

TypeScript client library for `codex app-server`.

## Status

The project is under active development. The implementation roadmap and progress tracker live in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

## Streaming Events

The app-server protocol is notification-driven once a turn starts.

- `turn/start` returns an initial turn snapshot immediately, but execution begins when `turn/started` arrives.
- For a streamed item, expect `item/started`, then zero or more item-specific delta or progress notifications, then `item/completed`.
- Reconstruct append-only text such as `item/agentMessage/delta` by concatenating deltas in arrival order.
- Treat `turn/completed` as the terminal notification for a turn's final status; token accounting may continue to arrive on `thread/tokenUsage/updated`.
- Per-connection opt-outs via `initialize.capabilities.optOutNotificationMethods` can suppress specific methods, so higher-level helpers should tolerate missing event classes when callers opt out.

## Turn Helper

`client.turn.run()` starts a turn, collects the matching lifecycle notifications
for that turn id, and resolves once `turn/completed` arrives.

```ts
const run = await client.turn.run({
  threadId,
  input: [
    {
      type: "text",
      text: "Reply with exactly helper-check.",
      text_elements: []
    }
  ]
});

const agentMessage = run.completedItems.find(
  (item) => item.type === "agentMessage"
);
```

The helper returns the immediate `turn/start` response, the ordered event log,
completed items, and reconstructed `item/agentMessage/delta` text keyed by item
id. It tolerates missing intermediate notifications such as `turn/started` when
the connection has opted out of those methods, but it still depends on
`turn/completed` to know when the run is finished.

## Thread Helper

`client.thread.run()` starts a thread and immediately runs the initial turn on
that thread.

```ts
const run = await client.thread.run({
  thread: {
    cwd,
    experimentalRawEvents: false,
    persistExtendedHistory: false
  },
  turn: {
    input: [
      {
        type: "text",
        text: "Reply with exactly helper-check.",
        text_elements: []
      }
    ]
  }
});

const threadId = run.thread.thread.id;
const turnId = run.turn.start.turn.id;
```

The helper returns both the immediate `thread/start` response and the streamed
turn result so callers can treat the initial conversation setup as one
operation while still retaining the lower-level responses. If the initial turn
fails after the thread has already been created, the helper rejects with
`AppServerClientThreadRunError`, which carries the successful `thread/start`
result so callers can recover the created thread id.

## Approval Helper

`client.handleApprovals()` wires the approval-style server request methods into
one callback.

```ts
const stopApprovals = client.handleApprovals(async (request) => {
  if (request.method === "item/permissions/requestApproval") {
    await request.respond({
      permissions: {},
      scope: "turn"
    });
    return;
  }

  switch (request.method) {
    case "applyPatchApproval":
    case "execCommandApproval":
      return { decision: "denied" };
    case "item/commandExecution/requestApproval":
    case "item/fileChange/requestApproval":
      return { decision: "decline" };
  }
});
```

The helper covers the legacy `applyPatchApproval` and `execCommandApproval`
requests plus the current `item/commandExecution/requestApproval`,
`item/fileChange/requestApproval`, and `item/permissions/requestApproval`
methods. Callers can still use `onServerRequest()` and `handleRequest()` when
they need low-level per-method control.

## Local Development

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

Run the real stdio integration coverage when `codex` is available locally:

```bash
npm run test:integration
```

Run the opt-in live logout integration only when you intentionally want the
test to sign the local Codex session out:

```bash
CODEX_CLIENT_ALLOW_LIVE_LOGOUT_TEST=1 npm test -- --run tests/integration/appServerStdio.test.ts -t "logs out the current account"
```

## Repository Workflow

- `main` is the protected release branch.
- Start new work by pulling the latest `main` with `git pull --ff-only origin main`, then create your feature branch.
- Changes should land through pull requests instead of direct pushes.
- GitHub Actions runs `CI` and `Bindings` checks for pull requests and `main`.
- Dependabot keeps npm and GitHub Actions dependencies moving through reviewable pull requests.

Repository-specific contributor guidance lives in [AGENTS.md](./AGENTS.md), [CODE_REVIEW_GUIDANCE.md](./CODE_REVIEW_GUIDANCE.md), and [QA_GUIDANCE.md](./QA_GUIDANCE.md).
