# 03 · Calculation

How a flow becomes scenarios. Code: `src/core/scenarios.ts` (paths, modes, IDs, flow
check), `src/core/analysis.ts` (remembering results).

## Paths (All)

- **CALC-01** All lists every path the flow allows (TERM-04), each exactly once.
- **CALC-02** A step without choices is passed through: it is on the path with no
  choice and does not branch.
- **CALC-03** At a step with choices, every choice that is offered (CALC-04, CALC-07,
  CALC-11) starts its own branch. A `next` choice continues to the following step;
  passing the last step completes the path.
- **CALC-04** An `end` choice stops its branch there: one Negative scenario, however
  many steps remain.
- **CALC-05** Happy = the path passes the last step; Negative = the path's last item
  is an `end` choice. Nothing else decides the type: a `[negative]` choice that
  continues does not make a scenario Negative (see CALC-41).
- **CALC-06** With no `end`, `loop` or `needs`, the number of paths is the product of
  the number of choices of each step (a step with none counts 1).

## Tags

- **CALC-07** A choice with `needs` is offered only if the path, before reaching it,
  already carries the tags its rule asks for. `,` = and, `|` = or, `!` = not; "or"
  binds tighter than "and"; no brackets. Tags are compared in lower case.
- **CALC-08** A choice with `sets` adds its tags to the path when it is taken. A tag
  stays for the rest of the path; there is no way to remove one.
- **CALC-09** A choice that is never offered on any path is unreachable (TERM-12),
  and every scenario through it is gone with it.

## Loops

- **CALC-10** A `loop` choice goes to its target step (`loop` alone: the same step;
  `loop to step N`: step N) and the walk continues from there.
- **CALC-11** Each loop choice can be taken at most `max` times on one path (default
  1, at most 9). Once used up it is simply not offered; it does not end the path.
- **CALC-12** Counted alone, a loop back over a step with k choices, whose steps in
  between can be passed in q ways, gives (k·q)^r paths for r passes, summed over
  r = 1 … max + 1.
- **CALC-13** A loop pointing forward acts as a skip (and the flow check warns,
  CALC-62).

## `distinct`

- **CALC-14** On a loop back to an earlier step, `distinct` holds back, at that
  target step only, the `next` choices already taken there in earlier rounds of the
  same run. `end` and `loop` choices there stay offered; the steps after the target
  are free.
- **CALC-15** A run is the rounds joined by that loop choice; taking any other loop
  ends the run, so a later plain loop back to the same step picks freely.
- **CALC-16** Paths whose rounds differ only in order count once: rounds are compared
  as a set (a round cut short by an `end` stays last). The first path walked is kept.
- **CALC-17** Counted alone: Σ over r = 1 … min(k, max + 1) of C(k, r) · q^r.
- **CALC-18** `distinct` does not depend on the order choices are listed in, so a set
  needing a tag from a choice listed later is still found (C then A when A needs C).

## The 1,000 limit

- **CALC-20** The walk stops after 1,000 different paths. All then lists those 1,000 first.
- **CALC-24** Paths that CALC-16 counts once do not count toward the 1,000: a flow with
  at most 1,000 different paths lists them all, unless the walk stops first. The walk
  also stops after 200,000 walked paths (orders counted), so it cannot run for minutes;
  All then lists the different paths found by then, and the flow is past the limit as
  above.
- **CALC-21** Past the limit, a targeted search (same rules as the walk, dead ends
  remembered) adds one path for each choice, each loop end and each pair the 1,000
  missed, so every mode can still cover them (CALC-36).
- **CALC-22** The search has a time budget: 3 s for a button press, 300 ms for the
  panel's live counts. When it runs out, the result says so (`searchComplete`
  false) and the flow check says what is uncertain (CALC-64).
- **CALC-23** Every path the search adds is a path the walk could have produced.

## Priority

- **CALC-25** A scenario's priority is the most important `P` on its choices, that is
  the **lowest** number: a path with a P1 choice is P1, even if it also has P3
  choices. Choices without a `P` do not count; a path with no `P` at all is P2.

## Modes

- **CALC-28** The **base path** (TERM-16) is a Happy scenario with the fewest loops
  (CALC-40) of all Happy scenarios, usually a path that takes no loop at all. Pairwise and
  Each treat it as one coverage item: a set covers it when it holds at least one Happy
  scenario with that fewest number of loops. A flow with no Happy scenario has no base
  path, and the item does not exist. Why: a choice that leaves a loop (`- no more`) is
  also taken by paths that went round the loop first, so without this item a mode could
  pick only looping paths and never test the plain way through (SCK flow: Pairwise picked
  four scenarios that all loop).
- **CALC-29** After the greedy picks (CALC-33, CALC-34), the picked scenarios are pruned:
  they are looked at from the last picked to the first, and one is dropped when the
  others still picked cover every item it covers (its choices, its loop ends, the base
  path and, for Pairwise, its pairs). So no picked scenario adds nothing, and the mode
  still covers everything it promises (CALC-36). The order is fixed, so the same flow
  always gives the same set (CALC-56). Pruning does not apply to All.
- **CALC-30** Every mode except All picks a subset of All's scenarios; none twice; it
  never invents a scenario.
- **CALC-31** (removed) EP, the grouping by `variant` choices. Removed in 0.6.0 (CALC-39).
- **CALC-32** (removed) EP's "stands for N similar" marks. Removed with EP.
- **CALC-33** Pairwise: greedy set cover over every choice, every loop end, every
  pair of choices on a path and the base path (CALC-28). Each round takes the scenario
  that covers the most items not yet covered; ties go to the higher priority, then the
  shorter path. Then the picks are pruned (CALC-29).
- **CALC-34** Each: greedy cover of every choice, every loop end and the base path
  (CALC-28), starting with the first Happy scenario in All's order (fewer loops first,
  CALC-42, so it is a base path), filling from Happy scenarios, then from scenarios with
  at most one failing choice, then from any. Then the picks are pruned (CALC-29).
- **CALC-35** Greedy is complete but not minimal: Pairwise and Each may pick more than
  the smallest possible set, even after pruning (CALC-29 drops scenarios that add
  nothing, it does not search for a smaller set). So in some flows Each can still pick
  more scenarios than Pairwise, although the smallest Each set is never bigger than the
  smallest Pairwise set. They must never be described as "the fewest".
- **CALC-36** Coverage guarantees, against what All has:

  | Mode | Always covers |
  | --- | --- |
  | All | every path (while under the limit) |
  | Pairwise | every choice, every loop end, every pair, the base path |
  | Each | every choice, every loop end, the base path |

- **CALC-37** Not promised: Each does not cover pairs;
  only All covers the rounds in between (for `max 3`: 1 and 2 rounds) and every
  order.
- **CALC-38** Lower bounds, for checking a size by hand (flows without loops): Each ≥
  ⌈choices ÷ most choices on one path⌉; Pairwise ≥ the number of choice pairs that
  can meet between the two steps with the most such pairs.
- **CALC-39** There is no EP (equivalence partitioning) mode since 0.6.0. The modes are
  All, Pairwise and Each, and Pairwise is the default. A board frame drawn before 0.6.0
  may carry the mode "ep": it is read as "no mode of its own", so the panel's switch
  decides, as for any frame without one. Why EP went: it only grouped choices marked
  `variant`, and then added back every choice it had dropped (CALC-36), so it removed
  little and its name promised more than it did.

## Scenario facts

- **CALC-40** `loops` of a scenario = how many loop choices its path takes.
- **CALC-41** A Happy scenario that takes a `[negative]` choice that continues is
  "via negative" (TERM-13).
- **CALC-42** All's order: fewer loops first, then longer paths first.

## Scenario IDs

- **CALC-50** An ID is `TSS-` (Happy) or `TSN-` (Negative) and a running number of at
  least three digits (`TSS-001`, `TSN-001`; past 999 the number just grows).
- **CALC-51** (removed) The number was a hash of the scenario's description (0.2.0);
  it is now a running number (CALC-55).
- **CALC-52** (removed) A clash of hashed numbers moved the later description to the next
  free number; running numbers never clash.
- **CALC-53** (removed) An ID changed only when its own path changed; running numbers
  can move when the flow gains or loses a scenario (CALC-56).
- **CALC-54** Any `TSS-`/`TSN-` number is read back (older boards used `TSS-001` or, in
  0.2.0, five digits such as `TSS-04821`).
- **CALC-55** The numbers are given after the list is sorted (CALC-42), one count per
  prefix: the first Happy scenario of the list is `TSS-001`, the next `TSS-002`, and
  the first Negative one is `TSN-001`. So 3 Happy and 2 Negative scenarios are
  `TSS-001` to `TSS-003` and `TSN-001`, `TSN-002`.
- **CALC-56** The same flow always gives the same IDs. When the flow gains or loses a
  scenario, the scenarios sorted after it of the same prefix move by one (or more);
  the ones before it keep their ID. The README says so.
- **CALC-57** Each mode numbers the scenarios it picks, in its own list (CALC-55): the
  biggest ID of a mode is its count per prefix (5 picked, 3 Happy and 2 Negative: at
  most `TSS-003` and `TSN-002`). The scenario notes, the Test steps tables, the copied
  text and the decision table of one mode all show the same IDs, so an ID traces back
  from any of them. The same scenario can have another ID in another mode. All keeps the
  numbers of CALC-55 over the whole list.

## Flow check

- **CALC-60** No steps → error.
- **CALC-61** No scenario at all → error.
- **CALC-62** Per step and choice: a step no scenario reaches (error); a step with
  choices none of which continues, not the last step (warning); a choice without a
  label (error); a duplicate label in a step (warning); a loop to a missing step
  (error); a loop pointing forward (warning); a `needs` tag nobody `sets` (error).
- **CALC-63** A choice in no scenario: "no path can take this choice" when it is
  unreachable (CALC-09); "the flow is too big to finish the search for it" when the
  search ran out of time (CALC-22).
- **CALC-64** Past the limit: one warning saying how many paths All lists (when the
  walk stopped at 200,000 before reaching 1,000 different ones, it says so and gives
  that number, CALC-24), how many were added, whether every pair was found, and what to do (Pair or Each, or `sets`/`needs` to cut impossible paths).
- **CALC-65** `distinct`: a warning when it does nothing (loop to itself or forward,
  or a target step without choices) or when `max + 1` is more than the target step's
  `next` choices (rounds past that are skipped).
- **CALC-66** Errors are listed before warnings.

## Mode tip

- **CALC-70** (removed) A suggested mode, "run them all" for a small flow; the line
  under the mode switch says what each mode picks (UI-47).
- **CALC-71** (removed) The suggestion for a flow without `variant`.
- **CALC-72** (removed) The suggestion for a flow with `variant`.

## Remembering results

- **CALC-80** The analysis of a flow (paths, each mode once, counts, flow check)
  is kept in memory for the last 8 flows, keyed by the flow's content. Nothing is
  written to disk or sent anywhere; it is lost when the board reloads.
- **CALC-81** A remembered result is used when it is complete, or when it had at
  least the requested search budget; otherwise it is worked out again.
- **CALC-82** Cached results are shared: nothing may change them after they are made.
- **CALC-83** Every mode picks at least one scenario when All has one. A flow without
  choices has no choice to cover, but still has its one path: Pairwise picks the first
  Happy scenario (the first scenario if none is Happy), as Each does. When that path is
  Happy it is the base path (CALC-28), so the rule follows from it.

## Decision table

The decision table (a test design technique) is worked out from the scenarios of a
mode. Drawing it is OUT-60 and the rules after it.

- **CALC-90** A **condition** of the decision table is a step with two or more
  choices. Its **values** are its choices, in the order they are written. A step with
  fewer than two choices is not a condition and is left out.
- **CALC-91** The columns are the scenarios of the chosen mode, Happy first, then
  Negative, each by priority and then ID (OUT-22). A column is named by the scenario's
  ID (`TSS-001`), the one of CALC-57.
  A Happy scenario belongs to the group **Success**, a Negative one to
  **Negative**. The ID of each column is drawn under its name (OUT-61), and the notes of
  the Scenarios frame are in the same order (OUT-65).
- **CALC-92** A value is marked for a scenario when the scenario takes that choice at
  least once on its path (a loop that takes two choices at one step marks both). A
  step the scenario never reaches has no mark for it.
- **CALC-93** (removed) The choices that end Negative scenarios and their expected
  results were part of the decision table; they are in the Test steps table (DRV-24).
- **CALC-94** A flow with no condition has no decision table: there is nothing to
  decide between.
