## Summary

- Describe the change.

## Validation

- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run test:integration` when the change needs real app-server coverage
- [ ] `npm run docs:build` when docs changed or when user-facing workflows/API docs may have drifted
- [ ] `npm run bindings:check` when generated bindings or generation scripts changed

## Checklist

- [ ] Docs or guidance updated if workflow, behavior, or expectations changed
- [ ] QA validated that changed docs still match the current code and workflows
- [ ] Complex or non-obvious logic is commented near the code
- [ ] Review and QA findings have been addressed before merge
