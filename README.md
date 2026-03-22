# codex-client

TypeScript client library for `codex app-server`.

## Status

The project is under active development. The implementation roadmap and progress tracker live in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

## Streaming Events

The app-server protocol is notification-driven once a turn starts.

- `turn/start` returns an initial turn snapshot immediately, but execution begins when `turn/started` arrives.
- For a streamed item, expect `item/started`, then zero or more item-specific delta or progress notifications, then `item/completed`.
- Reconstruct append-only text such as `item/agentMessage/delta` by concatenating deltas in arrival order.
- Treat `turn/completed` as the terminal notification for a turn's final status and token usage.
- Per-connection opt-outs via `initialize.capabilities.optOutNotificationMethods` can suppress specific methods, so higher-level helpers should tolerate missing event classes when callers opt out.

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
