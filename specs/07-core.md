# The core

The part of the code that turns a written flow into scenarios, test steps and tables,
with no drawing and no host. Code: `src/core/` (`index.ts` is the one file other code
imports). The Drawdy extension is one front end on top of it; a web page is another.

## The boundary

- **CORE-01** Nothing in `src/core/` imports from outside that folder, from
  `@drawdy/*` or from `node:*`, and nothing there uses the browser or Node globals
  (`document`, `window`, `process`, `require`). So the core runs in the extension, in a
  browser page and in a web worker alike.
- **CORE-02** Everything the core takes and gives is plain data: a text in, values out that
  survive `JSON.stringify`. No class instances, no functions in the results, no `Map` or `Set`.
- **CORE-03** The words of a report (note text, header, coverage, requirements, the order
  scenarios are shown in, the copied test steps and decision table) are made in the core.
  The drawing files only place them: sizes, colours and positions are not core.

## One call for a front end

- **CORE-10** `buildReport(text, mode)` gives, for a flow text and a mode: the flow, the
  reading warnings, the counts of every mode, the flow check, the header lines, the
  scenarios (ID, type, priority, loops, the choices taken, how many similar ones it stands
  for, its note and its test step rows) and the copied text of the test steps, of the
  decision table (null only for a text with no step, CORE-12) and of the steps list of the
  whole flow (`stepsListTsv`, OUT-67).
- **CORE-11** The scenarios of `buildReport` are the ones the extension draws for the same
  text and mode, in the same order and with the same IDs; its copied text is the text the
  extension copies. The golden snapshot (TEST-13) is what keeps them together.
- **CORE-12** `buildReport` for a text with no step in it (empty, blank, or only `@builder`)
  does not throw: no scenarios, zero counts and the reading warning ("No step found"). Any
  other text is read as at least one step, and gives its scenarios.
