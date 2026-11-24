# Specs

These files say what the extension does. They are the **source of truth**: when the
code, the tests or the README disagree with a spec, the spec wins, and the others are
fixed to match it (or the spec is changed on purpose, in the same commit).

| File | Covers |
| --- | --- |
| [00-glossary.md](00-glossary.md) | The words: flow, step, choice, scenario, test step, loop end… |
| [01-frontend.md](01-frontend.md) | The panel (the extension's window): layout, buttons, what is shown and when |
| [02-backend.md](02-backend.md) | The driver: lifecycle, messages with the panel, Drawdy commands, what each button does for each selection, data kept on the board, caching |
| [03-calculation.md](03-calculation.md) | How scenarios are worked out: paths, tags, loops, `distinct`, the 1,000 limit, the modes and what each guarantees, IDs, the flow check |
| [04-syntax.md](04-syntax.md) | The text a flow is written in |
| [05-board-output.md](05-board-output.md) | What is drawn on the board: flow diagrams, scenario frames and notes, tables, the copied text, placement |
| [06-testing.md](06-testing.md) | How the specs are checked: test files, the independent enumerator, mutation checks, the manual check in Drawdy |

## Rules

Each rule has an ID such as `CALC-07` and is written as a requirement ("must",
"never"). A test that checks a rule names the ID in its title or in a comment next to
the assertion, so `grep CALC-07` finds both. IDs are never reused: a removed rule
keeps its number with the text "(removed)".

| Prefix | File |
| --- | --- |
| `TERM` | 00-glossary.md |
| `UI` | 01-frontend.md |
| `DRV` | 02-backend.md |
| `CALC` | 03-calculation.md |
| `SYN` | 04-syntax.md |
| `OUT` | 05-board-output.md |
| `TEST` | 06-testing.md |

## Changing the extension

1. Change the spec first: add, edit or mark as removed the rules the change touches.
2. Change the code to match.
3. Add or update the tests that check those rules (and name the rule IDs).
4. Update the README where users see the change, and the CHANGELOG.
5. `npm test` passes, including the check that rule IDs are unique.

Keep the spec and the code in one commit, so the history never shows them apart.

The README is the user's guide and may explain more slowly or with more examples; it
must not say anything a spec contradicts.
