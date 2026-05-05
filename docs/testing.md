# Testing

## Current validation

```bash
npm test
npm run typecheck
npm run build
```

`npm test` uses Node's built-in test runner and currently covers the file and memory persistence adapters without requiring PostgreSQL.

## Suggested next tests

- Unit tests for HP and MP calculations.
- Unit tests for humanoid/monster/half-monster progression gating.
- API route tests for `GET /api/state` and `PUT /api/state`.
- PostgreSQL integration tests, preferably with a disposable database or testcontainer.
- Component tests for the creation wizard.
- End-to-end test for creating, saving, reloading, and exporting a character.
