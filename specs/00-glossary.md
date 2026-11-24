# 00 · Glossary

- **TERM-01 Flow.** The whole business flow a writer types: an ordered list of
  steps, each with its choices and fields. One flow per `@builder` note or per paste
  box.
- **TERM-02 Step.** A numbered line (`1. Sign in`). A step may have no choices; then
  every path passes through it.
- **TERM-03 Choice (condition).** A bullet line under a step (`- Sign in ok`). It
  continues to the next step, ends the flow (`-> end`) or goes back (`-> loop`). The
  code calls it `Cond`; the user always sees "choice" or the label itself.
- **TERM-04 Path.** One walk through the flow from step 1 until it either passes the
  last step or takes an `end` choice. A path lists, for each step it visits, the
  choice taken there (or none, for a step without choices).
- **TERM-05 Scenario.** One path, as a test: several test cases in a row. It is
  **Happy** when it passes the last step (loops included) and **Negative** when it
  ends on an `end` choice. The user sees "scenario", never "case" (see UI-20).
- **TERM-06 Test case.** One step of a scenario with the choice taken there, and the
  setup (`given:`), test data (`data:`) and expected result (`then:`) that apply. One
  row of a scenario's table.
- **TERM-07 Mode.** How many scenarios are shown: All, EP (equivalence
  partitioning), Pairwise (2-wise) or Each (each-choice, 1-wise). See CALC-30 to
  CALC-37.
- **TERM-08 Tag.** A word a choice puts on its path (`sets lv1`), read by later
  choices (`needs lv1`).
- **TERM-09 Loop end.** A loop choice with `max` 2 or more, taken its full `max`
  times on one path: the last round the loop allows.
- **TERM-10 Pair.** Two different choices that are on the same path.
- **TERM-11 Coverage item.** What a mode promises to include at least once: a
  choice, a loop end, or (for Pairwise and All) a pair.
- **TERM-12 Unreachable choice.** A choice no path can take, because its `needs`, or
  the loops and ends before it, rule it out.
- **TERM-13 Via negative.** A Happy scenario that takes a `[negative]` choice that
  does not end the flow (a retry that then succeeds).
- **TERM-14 Requirement.** An id written in a `req:` field, on a step or a choice.
- **TERM-15 Starter note.** A ready-made `@builder` note the panel drops on the board.
