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
#                   then: is a value to assert (a number, status or code), never just "works"
# req: R-01         a requirement id, on a step or a choice
# -> end            the flow stops here: a negative scenario
# -> loop to step 2 max 2   go back to step 2, at most 2 rounds
# [distinct]        on a loop: a round offers only choices not picked yet
# [variant]         choices marked variant do not multiply each other in EP
# [negative]        a choice that fails but the flow goes on
# needs: x          a choice only a path with tag x can take (and, or, not / !)
# sets: x           this choice tags the path with x
# Delete the comments and the steps you do not need.

1. Authentication
   req: R-01
   given: the shop is up, the shipping fee table is Standard 5.00 and Express 12.00
   - Log in [P1]
     sets: user
     data: username user_001, password Passw0rd!
     then: 200 OK, the header shows "user_001", a session token is issued
   - Continue as guest [P2]
     sets: guest
     data: no account, email guest@example.com
     then: 200 OK, the header shows "Guest", no session token
2. Select Products
   req: R-02
   given: the catalog has SKU-001 Shirt 20.00 and SKU-002 Shoes 50.00, both in stock
   - Shirt [variant]
     data: SKU-001, quantity 1
     then: the product page shows price 20.00
   - Shoes [variant]
     data: SKU-002, quantity 1
     then: the product page shows price 50.00
3. Add to Shopping Cart
   - Added [P1]
     then: 201 Created, the cart item count goes up by 1, the cart line shows the SKU and its price
   - Out of stock -> end [negative]
     given: the stock of the product is 0
     then: 409 OUT_OF_STOCK, the cart item count does not change
4. Calculate Total
   then: the subtotal is the sum of the prices in the cart: 20.00 (shirt), 50.00 (shoes) or 70.00 (both)
5. More product?
   - Add another product -> loop to step 2 max 2 [distinct]
     then: the product list opens again, the cart item count is still 1 after round 1
   - No more product [P1]
     then: the page moves to shipping, the cart item count is unchanged (1 or 2)
6. Select Shipping Methods
   - Standard [P1]
     then: the shipping method is Standard, the fee is 5.00
   - Express (members only) [P2]
     needs: user
     then: the shipping method is Express, the fee is 12.00
7. Add shipping Charge
   data: weight 1 kg
   - Charge added [P1]
     then: the shipping charge equals the fee of the method: 5.00 (Standard) or 12.00 (Express)
   - Free shipping (members only) [P2]
     needs: user
     data: promo code FREESHIP
     then: the shipping charge is 0.00 and the order total equals the subtotal
8. Enter Shipping Info
   - Use saved address (members only)
     needs: user
     data: address id addr_001, 12 Main St, Springfield, 12345
     then: the shipping address is 12 Main St, Springfield, 12345
   - Type a new address [P1]
     data: 99 Oak Ave, Austin, TX, 73301
     then: the address check returns valid, the shipping address is 99 Oak Ave, Austin, TX, 73301
9. Select Payment Methods
   - Saved card (members only)
     needs: user
     data: the card saved on user_001, ending 4242
     then: the payment method shows "Visa ending 4242"
   - New card [P1]
     data: card 4111 1111 1111 1111, expiry 12/30, CVV 123
     then: the payment method shows "Visa ending 1111"
   - Cash on delivery (guests only)
     needs: !user
     sets: cod
     then: the payment method is COD, the amount due on delivery is the order total
10. Verify Credit Info Complete?
   req: R-03
   - Payment succeeded [P1]
     then: the order status is CONFIRMED, a receipt email with the order number and the total is sent
   - Payment failed -> end [P2]
     needs: !cod
     data: test card 4000 0000 0000 0002
     then: the gateway returns CARD_DECLINED, the order status stays PENDING_PAYMENT, the amount charged is 0.00
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
