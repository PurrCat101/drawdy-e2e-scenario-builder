// The flow model. Types only: the text syntax lives in syntax.ts, the scenario
// logic in scenarios.ts.

export type CondAction = "next" | "loop" | "end";

export type Cond = {
    id: string;
    label: string;
    /** a failing / negative choice */
    neg: boolean;
    action: CondAction;
    /** loop: the id of the step to go back to */
    target: string | null;
    /** loop: how many rounds it may repeat */
    max: number;
    /** tags this condition sets on the path (comma separated) */
    tags: string;
    /** what the path must already have: `,` = and, `|` = or, `!` = not */
    need: string;
    /** "1" | "2" | "3" | "" (empty = P2) */
    pri: string;
    /** does not multiply with other scenarios (collapsed by EP) */
    variant: boolean;
    /**
     * loop: on the next round, the steps it goes back over offer only the choices
     * not taken yet, and an earlier pick counts once whatever the order
     * (pick A then B = pick B then A). Ends and loops there stay available.
     */
    distinct?: boolean;
    /** test data, expected result, setup and requirement id (all optional) */
    data?: string;
    exp?: string;
    pre?: string;
    req?: string;
};

export type Step = {
    id: string;
    name: string;
    conds: Cond[];
    /** test data, expected result, setup and requirement id (all optional) */
    data?: string;
    exp?: string;
    pre?: string;
    req?: string;
};

export type Flow = { steps: Step[] };

export type Mode = "ep" | "all" | "pair" | "min";
