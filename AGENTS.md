# AGENTS.md

This repository is for building a TypeScript client for `codex app-server`.

Before starting work, read:

- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

That plan is the active roadmap and progress tracker. This file defines how work should be carried out and what quality bar changes must meet before they are considered complete.

## Project Priorities

The project values the following, in order:

1. Correctness and protocol fidelity
2. Readable, maintainable TypeScript
3. Small, reviewable changes
4. Strong review and QA discipline
5. Clear documentation and developer ergonomics

## Architecture Expectations

- Keep the code modular. Do not collapse major functionality into a single large TypeScript file.
- Break code into focused directories and files when that improves readability.
- Separate transport, RPC/session management, protocol bindings, and client-facing APIs.
- Keep generated code isolated from handwritten code.
- Do not hand-edit generated bindings.
- Prefer composition over monolithic classes when practical.
- Add comments anywhere a human reader would otherwise have to reverse-engineer intent, invariants, protocol assumptions, lifecycle rules, edge-case handling, or other non-obvious behavior.
- Err on the side of documenting tricky logic, state transitions, parsing rules, and protocol-driven constraints.
- Do not leave dense or subtle code blocks unexplained just because the code is technically correct.
- Do not add noisy comments that restate obvious code.

## TypeScript Quality Standards

- Follow current TypeScript best practices.
- Prefer explicit, well-named types over unclear implicit shapes.
- Keep public APIs intentionally designed and documented.
- Use strict typing and avoid unnecessary `any`.
- Model protocol unions and lifecycle states clearly.
- Handle errors deliberately and consistently.
- Keep function and file responsibilities narrow.
- Prefer small helpers over deeply nested control flow.
- Write code for humans first, then for machines.
- If a piece of code is complicated enough to slow down a careful reviewer, it likely needs a clarifying comment.
- Comments should explain why the code exists, what constraints it is honoring, and what assumptions must remain true.
- Public-facing modules, protocol boundaries, and tricky internal helpers should have enough commentary that a new contributor can understand them without guesswork.

## Repository Organization

As the project grows, favor a structure like:

```text
src/
  client/
  protocol/
  rpc/
  transport/
  generated/
scripts/
tests/
```

This is guidance, not a frozen constraint, but the spirit matters: keep concerns separated and easy to navigate.

## Git Workflow

Manageable git history is a hard requirement.

- Before creating a feature branch, run `git pull --ff-only origin main` from `main` so new work always starts from the latest protected branch tip.
- All changes must be committed in manageable chunks.
- Do not let large unrelated edits accumulate in a single commit.
- Keep commits scoped to a single logical step whenever possible.
- Prefer a sequence of small, understandable commits over a single sweeping commit.
- When a task naturally spans multiple steps, commit each completed step separately.
- Commit messages should clearly describe the change in human language.

A task is not complete just because code was written locally. The expected flow is:

1. Implement a logical chunk.
2. Run relevant local validation.
3. Commit that chunk.
4. Hand the change off to a sub-agent for code review.
5. Fix issues found in review.
6. Re-commit the follow-up fixes in manageable chunks.
7. Hand the updated work off to a sub-agent for QA.
8. Fix any QA issues found.
9. Re-commit those fixes in manageable chunks.

Only after review and QA have both completed is the task considered done.

## GitHub Repository Workflow

- `main` is the protected branch.
- Start feature work by updating local `main` with `git pull --ff-only origin main`, then branch from that refreshed tip.
- Push feature work to a branch and land it through a pull request.
- Keep required GitHub checks green before merge.
- The baseline required checks are the `CI` workflow and the `Bindings` workflow.
- Automation changes such as GitHub Actions, Dependabot, templates, or protection rules should be documented in repo guidance when they change contributor expectations.

## Required Code Review Process

Every meaningful code change must go through sub-agent code review.

- The code review sub-agent should read [CODE_REVIEW_GUIDANCE.md](./CODE_REVIEW_GUIDANCE.md) before reviewing.
- The task is not complete until a sub-agent has reviewed the change.
- The agent should automatically run this review step as part of the normal workflow.
- Do not ask the user whether code review should be run.
- Do not ask the user whether code review should be skipped or bypassed.
- The code reviewer must not make code changes directly.
- The code reviewer is responsible for identifying issues, risks, regressions, and gaps, not for editing files.
- Any fixes identified during review must be applied by the implementing agent, then re-reviewed as needed.
- Review should focus on correctness, regressions, maintainability, edge cases, and missing tests.
- Review is iterative, not ceremonial.
- If the review identifies issues, fix them and repeat review as needed until the change is in good shape.
- Treat review findings as part of the implementation process, not as optional follow-up work.

## Required QA Process

After code review is complete, every meaningful code change must go through sub-agent QA.

- The QA sub-agent should read [QA_GUIDANCE.md](./QA_GUIDANCE.md) before validating.
- QA must be performed by a sub-agent after code review has finished.
- The agent should automatically run this QA step after code review.
- Do not ask the user whether QA should be run.
- Do not ask the user whether QA should be skipped or bypassed.
- The QA sub-agent must not make code changes directly.
- The QA sub-agent is responsible for validation, testing, and issue discovery, not for editing files.
- Any fixes identified during QA must be applied by the implementing agent, then re-validated as needed.
- QA is also iterative.
- If QA finds issues, fix them and run QA again until the change is ready.
- QA should include automated validation where available.
- QA should also include exploratory testing of the actual client whenever feasible.
- If the client can be run against a real or realistic app-server setup, do that.
- If exploratory testing is blocked, document what was attempted, what was validated, and what remains unverified.

## Testing Expectations

- Add automated tests for behavior that can and should be verified automatically.
- Prefer focused tests that validate protocol handling, state transitions, and edge cases.
- Do not rely only on unit tests when integration behavior is important.
- When practical, verify behavior against a real `codex app-server`.
- Keep test structure readable and close to the architecture of the system.

## Documentation Expectations

- Update [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) as work progresses.
- Keep architecture and workflow documentation aligned with the codebase.
- Document important invariants, tradeoffs, and gotchas near the code or in repo docs.
- If a new script or workflow is introduced, explain how it should be used.
- When code introduces non-obvious behavior, the explanation should live close to that code, not only in a separate document.

## Definition Of Done

A task is done only when all of the following are true:

- The implementation is complete for the intended scope.
- The code is clean, human-readable, and appropriately commented.
- Complex or non-obvious code paths have comments that explain intent and constraints well enough for a future maintainer.
- The change is broken into manageable git commits.
- Relevant automated tests have been added or updated.
- Relevant local validation has been run.
- A sub-agent has completed code review.
- Review findings have been addressed through an iterative fix-and-review loop.
- A sub-agent has completed QA.
- QA findings have been addressed through an iterative fix-and-QA loop.
- Exploratory testing has been performed when feasible, especially for real client behavior.
- The implementation plan or related docs have been updated if needed.

## Agent Behavior

- The agent is expected to follow the review and QA cycle automatically.
- The default workflow is implementation -> validation -> commit -> sub-agent review -> fixes -> sub-agent QA -> fixes -> completion.
- The agent should not treat review and QA as optional steps.
- The agent should not ask the user for permission to perform required review or QA passes.
- The agent should only stop short of these steps if technically blocked, and in that case it should explain the blocker clearly.

## Working Style

- Prefer steady, incremental progress over large speculative rewrites.
- Make the next small correct move.
- Preserve readability as the codebase grows.
- Optimize for future maintainers being able to understand the system quickly.
- When in doubt, choose the design that is easier to review, test, and explain.

## MCP Guidance

Use the available MCP tools intentionally as part of normal project execution.

### Sequential Thinking MCP

- Prefer the `sequential-thinking` MCP for reasoning-heavy work.
- Use it when planning architecture, breaking down complex tasks, evaluating tradeoffs, debugging multi-step issues, or revising an approach.
- It should be the default aid for non-trivial reasoning, especially when the work has multiple moving parts or hidden edge cases.
- The goal is not to add ceremony. The goal is to make complex thinking more explicit, testable, and easier to hand off.

### Memory MCP

- Use the `memory` MCP to store important long-lived project context.
- Record decisions, constraints, conventions, and handoff-critical information when it will help future work.
- Use memory to support cleaner handoff between implementation, code review, and QA passes.
- Prefer storing durable, high-value context rather than transient noise.
- If a choice is likely to matter later, capture it.
- Use memory as the running project ledger for meaningful work.
- After each meaningful implementation chunk, record a concise summary of what changed.
- Record commit hashes and what each commit represents when that context will help future handoff or traceability.
- Record key code review findings, including what was flagged and how those issues were resolved.
- Record key QA findings, including automated validation results, exploratory testing performed, and any fixes applied.
- Record important follow-up items, known limitations, and unresolved risks when they remain after a task.
- Keep entries compact and useful so future agents can quickly reconstruct recent history without digging through everything manually.
- Memory should complement git history, code review, and QA artifacts, not replace them.
