# QA Guidance

This document defines how QA should be performed for this repository.

QA reviewers should also read:

- [AGENTS.md](./AGENTS.md)
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

`AGENTS.md` defines the overall workflow and quality bar. This document defines the specific expectations for the QA pass.

## QA Role

The QA sub-agent is a read-only validator.

- Do not make code changes directly.
- Do not edit files.
- Do not fix issues during the QA pass.
- Validate behavior, identify problems clearly, and hand findings back to the implementing agent.

The implementing agent is responsible for making fixes and re-running QA as needed.

## QA Goal

The goal of QA is to verify that the change works as intended in practice and that the implementation is ready for handoff.

QA should validate both expected behavior and likely failure paths. It should not be limited to checking whether tests happen to pass.

## Primary QA Priorities

Validate in this order:

1. The change behaves correctly for its intended scope
2. Existing behavior has not regressed
3. Automated validation is present and meaningful
4. Real client behavior has been exercised when feasible
5. Edge cases and error handling have been checked
6. The change is ready for continued development or release

## What QA Should Do

QA should explicitly:

- run or verify relevant automated tests
- confirm the tests are actually exercising the intended behavior
- perform exploratory testing when the client can be run meaningfully
- verify integration points, especially around protocol flows and lifecycle behavior
- check that fixes from code review behave as intended
- note any gaps in validation or coverage

## Exploratory Testing Expectations

Exploratory testing is expected whenever it is feasible.

QA should try to exercise the actual client in realistic ways, especially for:

- transport behavior
- request and response handling
- notification streaming
- approvals
- turn lifecycle flows
- error paths

If real exploratory testing is blocked, QA should say:

- what was attempted
- what could be validated
- what could not be validated
- what risk remains because of that gap

## QA Output

QA findings should be actionable and easy to work through.

- Put findings first.
- Reference files, tests, commands, and behaviors when relevant.
- Distinguish clearly between verified behavior and unverified assumptions.
- Be explicit about what passed, what failed, and what was not tested.
- Keep summaries brief and secondary to findings.
- If no meaningful findings are present, say that explicitly.

## QA Tone

- Be direct and specific.
- Be concise.
- Be respectful.
- Optimize for clarity and reproducibility.
- Avoid vague statements like "seems fine" without saying what was actually checked.

## Iterative QA

QA is expected to be iterative.

- When issues are fixed, validate the updated state again.
- Confirm whether previous QA concerns were actually resolved.
- Check that fixes did not introduce new regressions.
- Continue until the change is in good shape.

## Completion Standard

A QA pass is complete only when:

- relevant automated validation has been run or the gap is clearly documented
- exploratory testing has been performed when feasible, or the blocker is clearly documented
- all meaningful QA findings have been addressed or consciously accepted
- the change is ready for handoff
