# Working on this repo

- `specs/` is the source of truth for what the extension does. Read the spec files
  that cover a change before changing code.
- Every change to behaviour updates the spec in the same commit: add, edit or mark as
  "(removed)" the rules it touches (see `specs/README.md`). Never reuse a rule ID.
- Tests that check a rule name its ID (for example `CALC-17`) in the test title or a
  comment. `npm test` checks that rule IDs are unique and that every ID named exists.
- A new test file must be added to the `test` script in `package.json`.
- User-facing text says "scenario", never "case" (`specs/01-frontend.md`, UI-20).
- Run `npm test` before committing; `npm run build` builds the `.drawdyx`.
- A failing property test (`test/property.test.ts`) is shrunk by fast-check: keep the
  printed smallest flow as a plain example test next to it (TEST-12).
