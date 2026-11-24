// The starter note: a ready-made `@builder` text that the panel drops on the board as a
// sticky note. The writer then edits the note on the board (a lot more room than the
// panel) and presses Flow + Scenarios. Lines starting with `#` are comments, so the
// template doubles as a syntax cheat sheet and the comments can simply be deleted.
//
// The template must read without warnings and make scenarios; test/syntax.test.ts
// checks that, so a change to the syntax cannot leave a stale template behind.

export type Template = {
    id: string;
    /** the button's label in the panel */
    label: string;
    /** what the button does, for its tooltip */
    hint: string;
    text: string;
};

/** One template: an online-shop checkout, with every piece of the syntax. */
const SHOP = `@builder
@title Online shop: checkout
# One template that shows the whole syntax. Lines starting with # are ignored.
# 1. Step           a step: a number, then its name
# - choice          a choice at that step (a step may have many)
# [P1] [P2] [P3]    priority: the lowest P on a scenario is its priority
# given: data: then:  setup, test data, expected result (before a choice = the step)
# req: R-01         a requirement id, on a step or a choice
# -> end            the flow stops here: a negative scenario
# -> loop to step 2 max 2   go back to step 2, at most 2 rounds
# [distinct]        on a loop: a round offers only choices not picked yet
# [variant]         choices marked variant do not multiply each other in EP
# [negative]        a choice that fails but the flow goes on
# [sets x]          this choice tags the path with x
# [needs x]         a choice only a path with tag x can take (and, or, not / !)
# Delete the comments and the steps you do not need.

1. Authentication
   req: R-01
   - Log in [P1, sets user]
     data: account lab-user-001
   - Continue as guest [P2, sets guest]
     data: no account
2. Select Products
   req: R-02
   - Shirt [variant]
   - Shoes [variant]
3. Add to Shopping Cart
   then: the cart shows the product
   - Added [P1]
   - Out of stock -> end [negative]
4. Calculate Total
   then: the total is shown
5. More product?
   - Add another product -> loop to step 2 max 2 [distinct]
   - No more product [P1]
6. Select Shipping Methods
   - Standard [P1]
   - Express [P2, needs user]
7. Add shipping Charge
   data: weight 1 kg
   - Charge added [P1]
   - Free shipping [P2, needs user]
8. Enter Shipping Info
   - Use saved address [needs user]
   - Type a new address [P1]
     then: the address is checked
9. Select Payment Methods
   - Saved card [needs user]
   - New card [P1]
   - Cash on delivery [needs !user]
10. Verify Credit Info Complete?
   req: R-03
   - Payment succeeded [P1]
     then: a receipt is sent
   - Payment failed -> end [P2]
     then: nothing is charged
`;

export const TEMPLATES: Template[] = [
    {
        id: "shop",
        label: "Start with a template",
        hint: "an online-shop checkout: log in or guest, products, shipping, payment (every piece of the syntax)",
        text: SHOP,
    },
];

export const templateById = (id: unknown): Template | undefined =>
    TEMPLATES.find((t) => t.id === id);
