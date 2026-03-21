# Code Review Guidance

This document defines how code review should be performed for this repository.

Reviewers should also read:

- [AGENTS.md](./AGENTS.md)
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

`AGENTS.md` defines the overall workflow and quality bar. This document defines the specific expectations for the code review pass.

## Reviewer Role

The code reviewer is a read-only reviewer.

- Do not make code changes directly.
- Do not edit files.
- Do not fix issues in the review pass.
- Identify problems, explain them clearly, and hand findings back to the implementing agent.

The implementing agent is responsible for making fixes and re-running review as needed.

## Review Goal

The goal of review is to find what is wrong, risky, unclear, incomplete, or likely to regress.

Review is not a rubber stamp. It should focus on protecting correctness, maintainability, and long-term readability.

## Primary Review Priorities

Review in this order:

1. Correctness and protocol fidelity
2. Behavioral regressions
3. Missing edge-case handling
4. Type safety and API clarity
5. Test coverage and validation gaps
6. Readability, modularity, and maintainability
7. Comment quality and documentation of non-obvious logic

## What To Look For

Reviewers should explicitly look for:

- protocol handling mistakes
- broken lifecycle or state-transition logic
- request/response routing errors
- notification ordering assumptions that are unsafe
- error handling gaps
- type holes, unsafe assumptions, or overuse of `any`
- monolithic files or poor separation of concerns
- weak naming or unclear API boundaries
- insufficient comments around tricky logic, invariants, or protocol constraints
- missing tests for important behavior
- tests that do not actually prove the intended behavior

## Comment And Readability Expectations

This repository expects clean, human-readable, commented code.

Reviewers should call out:

- dense or subtle code that lacks explanation
- non-obvious protocol assumptions that are not documented near the code
- state machines or parsing logic that are hard to follow
- helpers or abstractions whose purpose is unclear
- files that are growing too large or carrying too many responsibilities

If a careful reader would have to reverse-engineer intent, that is a review concern.

## Review Output

Review findings should be actionable and easy to work through.

- Put findings first.
- Prefer concrete findings over broad style commentary.
- Reference files and lines when possible.
- Explain the risk or likely failure mode, not just the symptom.
- Keep summaries brief and secondary to findings.
- If no meaningful findings are present, say that explicitly.

## Review Tone

- Be direct and specific.
- Be concise.
- Be respectful.
- Optimize for clarity and issue resolution.
- Avoid vague feedback that leaves the implementing agent guessing.

## Iterative Review

Review is expected to be iterative.

- When findings are fixed, review the updated state again.
- Confirm whether previous concerns were resolved.
- Surface any new issues introduced by the fixes.
- Continue until the change is in good shape.

## Completion Standard

A code review pass is complete only when:

- all meaningful findings have been addressed or consciously accepted
- the change meets the repository quality bar
- the result is ready for the QA pass
