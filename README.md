# codex-client

TypeScript client library for `codex app-server`.

## Status

The project is under active development. The implementation roadmap and progress tracker live in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

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

## Repository Workflow

- `main` is the protected release branch.
- Start new work by pulling the latest `main` with `git pull --ff-only origin main`, then create your feature branch.
- Changes should land through pull requests instead of direct pushes.
- GitHub Actions runs `CI` and `Bindings` checks for pull requests and `main`.
- Dependabot keeps npm and GitHub Actions dependencies moving through reviewable pull requests.

Repository-specific contributor guidance lives in [AGENTS.md](./AGENTS.md), [CODE_REVIEW_GUIDANCE.md](./CODE_REVIEW_GUIDANCE.md), and [QA_GUIDANCE.md](./QA_GUIDANCE.md).
