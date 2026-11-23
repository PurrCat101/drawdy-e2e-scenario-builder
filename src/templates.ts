// Starter notes: ready-made `@builder` texts that the panel drops on the board as a
// sticky note. The writer then edits the note on the board (a lot more room than the
// panel) and presses Flow + Cases. Lines starting with `#` are comments, so each
// template doubles as a syntax cheat sheet and the comments can simply be deleted.
//
// Every template must read without warnings and make cases; test/syntax.test.ts
// checks that, so a change to the syntax cannot leave a stale template behind.

export type Template = {
    id: string;
    /** the button's label in the panel */
    label: string;
    /** what the button does, for its tooltip */
    hint: string;
    text: string;
};

const BASIC = `@builder
@title My flow
# HOW TO WRITE (lines starting with # are ignored; delete them when done)
# 1. Step name          a step: a number, then its name
# - choice              a choice at that step; a step may have many
# - choice -> end       the flow stops here (a negative case)
# [P1]                  priority at the end of a choice: P1, P2 or P3
# given: / data: / then:   setup, test data, expected result
#                       (before the first choice = the step, after = that choice)
# Then select this note and press "Flow + Cases" in the panel.

1. Open the site and sign in
   given: the site is up
   data: user a
   then: the home page is shown
   - Sign in ok [P1]
     data: correct password
   - Sign in failed -> end [P2]
     data: wrong password
     then: an error is shown
2. Pick an item
   - shirt
   - shoes
3. Checkout
   - Paid [P1]
     then: a receipt is shown
   - Card declined -> end [P1]
     then: nothing is charged
`;

const LOOP = `@builder
@title Flow with loops and negatives
# -> end                    the flow stops here (negative)
# -> loop                   go round the same step again
# -> loop to step 2 max 2   go back to step 2, at most 2 rounds (default 1, up to 9)
# [negative]                a failing choice where the flow still goes on
# [variant]                 choices marked variant do not multiply each other,
#                           so EP keeps one case for them
# Lines starting with # are ignored. Delete them when done.

1. Sign in
   - Sign in ok [P1]
   - Sign in failed -> end [P2]
2. Pick an item
   - shirt [variant]
   - shoes [variant]
   - Sold out -> loop to step 2 max 2 [negative]
3. Checkout
   - Paid [P1]
   - Card declined -> end [P1]
`;

const LEVELS = `@builder
@title Flow with levels (sets / needs)
# sets lv1                  tag the path that takes this choice
# needs lv2                 reachable only if the path has the tag
# needs lv1 and master      words: and, or, not (or !); "or" binds tighter than "and"
# req: R-01                 a requirement id for the step or choice
# Lines starting with # are ignored. Delete them when done.

1. Check the account
   req: R-01
   - Level 1 [P1, variant, sets lv1]
     given: the test API sets level 1
   - Level 2 [P1, variant, sets lv2]
     given: the test API sets level 2
   - Not verified -> end [P1]
     given: the test API sets level 0
     then: the verify-identity dialog is shown
2. Buy a premium item
   - Allowed [P1, needs lv2]
     then: the purchase succeeds
   - Level required -> end [P1, needs lv1]
     then: 403 LEVEL_REQUIRED, nothing changes
`;

export const TEMPLATES: Template[] = [
    { id: "basic", label: "Basic", hint: "3 steps, with the syntax explained in comments", text: BASIC },
    { id: "loop", label: "Loop", hint: "a retry loop, a negative choice and variants", text: LOOP },
    { id: "levels", label: "Levels", hint: "choices that set and need tags (sets / needs)", text: LEVELS },
];

export const templateById = (id: unknown): Template | undefined =>
    TEMPLATES.find((t) => t.id === id);
