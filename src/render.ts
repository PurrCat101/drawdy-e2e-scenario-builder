import type { DrawdyElementSchema } from "@drawdy/driver-protocol";
import type { Flow } from "./core/flow";

const W = 220;
const GAP = 160;
const PAD = 60;
const COLORS = {
    acc: "#2f5fd0",
    accBg: "#e8eefc",
    neg: "#b42318",
    negBg: "#fdecea",
    loop: "#d98e04",
    ok: "#1b7a4b",
    okBg: "#e5f3ea",
    mut: "#6a7280",
};

/** Break a label into lines of about `n` characters, at spaces where possible. */
function wrap(text: string, n: number): string[] {
    const out: string[] = [];
    let line = "";
    for (const w of text.split(/\s+/).filter(Boolean)) {
        if (line && (line + " " + w).length > n) {
            out.push(line);
            line = w;
        } else line = line ? line + " " + w : w;
    }
    if (line) out.push(line);
    return out.length ? out : [""];
}

/** Several choices on one arrow: one per line, and a choice is never broken across lines. */
const arrowText = (labels: string[]) => labels.join("\n");

/** About how wide a character of an arrow label is (font size 12). */
const LABEL_CHAR_W = 7;

export type ArrowLabel = {
    arrowId: string;
    text: string;
    /** Canvas midpoint, used for the fallback text element. */
    mid: [number, number];
    color: string;
};

export type Rendered = {
    frameId: string;
    elements: DrawdyElementSchema[];
    labels: ArrowLabel[];
};

/**
 * Lay the flow out left to right and describe it as Drawdy elements.
 * Order matters: frame first, then shapes, then arrows (bindings resolve
 * against elements that already exist or come earlier in the batch).
 */
export function renderFlow(
    flow: Flow,
    generateId: () => string,
    origin: [number, number],
    opts: { name?: string; success?: boolean } = {}
): Rendered {
    // a single-case flow (name given) is drawn without the green "success" end
    // when the case ends in a failure
    const success = opts.success !== false;
    const [ox, oy] = origin;
    const frameId = generateId();
    const shapes: DrawdyElementSchema[] = [];
    const arrows: DrawdyElementSchema[] = [];
    const labels: ArrowLabel[] = [];

    const stepId: Record<string, string> = {};
    const stepIdx: Record<string, number> = {};
    flow.steps.forEach((s, i) => {
        stepId[s.id] = generateId();
        stepIdx[s.id] = i;
    });

    const mainY = oy + PAD + 80;
    // the arrow after a step is as long as its longest choice label needs, so each
    // choice stays on one line (OUT-12)
    const gapAfter = flow.steps.map((s) => {
        const widest = Math.max(
            0,
            ...s.conds.filter((c) => c.action === "next").map((c) => c.label.length)
        );
        return Math.max(GAP, widest * LABEL_CHAR_W + 60);
    });
    const stepX = (i: number) =>
        ox + PAD + i * W + gapAfter.slice(0, i).reduce((a, b) => a + b, 0);
    const stepH = (i: number) => (flow.steps[i].conds.length ? 120 : 70);
    let maxY = mainY + 140;

    flow.steps.forEach((s, i) => {
        const decision = s.conds.length > 0;
        shapes.push({
            type: "shape",
            componentType: decision ? "diamond" : "rect",
            drawdyElementId: stepId[s.id],
            frameId,
            x: stepX(i),
            y: mainY + (120 - stepH(i)) / 2,
            width: W,
            height: stepH(i),
            strokeColor: COLORS.acc,
            fillColor: decision ? "#ffffff" : COLORS.accBg,
            roughness: 0,
            text: `${i + 1}. ${s.name}`,
            fontSize: 14,
            textAlign: "center",
            textVerticalAlign: "middle",
            meta: { kind: "step", stepId: s.id },
        });
    });

    const addArrow = (
        from: { id: string; ax: number; ay: number },
        to: { id: string; ax: number; ay: number },
        color: string,
        label: string,
        mid: [number, number],
        opts: { dashed?: boolean; elbow?: boolean } = {}
    ) => {
        const arrowId = generateId();
        arrows.push({
            type: "arrow",
            drawdyElementId: arrowId,
            frameId,
            color,
            strokeWidth: 2,
            strokeDash: opts.dashed ? "dashed" : "solid",
            elbowRouting: opts.elbow ?? false,
            startBinding: {
                drawdyElementId: from.id,
                anchorX: from.ax,
                anchorY: from.ay,
            },
            endBinding: {
                drawdyElementId: to.id,
                anchorX: to.ax,
                anchorY: to.ay,
            },
        });
        if (label) labels.push({ arrowId, text: label, mid, color });
    };

    flow.steps.forEach((s, i) => {
        const id = stepId[s.id];
        const nexts = s.conds.filter((c) => c.action === "next");
        const last = i === flow.steps.length - 1;
        const cx = stepX(i) + W;
        const cy = mainY + 60;

        // main path: one arrow to the next step, labelled with its conditions
        if (!last && (nexts.length || !s.conds.length)) {
            addArrow(
                { id, ax: 1, ay: 0.5 },
                { id: stepId[flow.steps[i + 1].id], ax: 0, ay: 0.5 },
                COLORS.acc,
                arrowText(nexts.map((c) => c.label)),
                [cx + gapAfter[i] / 2, cy - 14]
            );
        }

        let endY = 0;
        s.conds.forEach((c) => {
            if (c.action === "loop" && c.target) {
                const t = stepIdx[c.target];
                addArrow(
                    { id, ax: 0.5, ay: 0 },
                    { id: stepId[c.target], ax: 0.5, ay: 0 },
                    COLORS.loop,
                    `${c.label} ↻ up to ${c.max} ${c.max === 1 ? "time" : "times"}`,
                    [(stepX(i) + stepX(t)) / 2 + W / 2, mainY - 30],
                    { dashed: true, elbow: true }
                );
            } else if (c.action === "end") {
                const tid = generateId();
                const lines = wrap(c.label, 20);
                const th = Math.max(50, 24 + lines.length * 16);
                const ty = mainY + 190 + endY;
                endY += th + 30;
                maxY = Math.max(maxY, ty + th);
                shapes.push({
                    type: "shape",
                    componentType: "rect",
                    drawdyElementId: tid,
                    frameId,
                    // right of the trunk that comes down from the step, so the
                    // arrows to several end nodes never cross a node
                    x: stepX(i) + W / 2 + 24,
                    y: ty,
                    width: 150,
                    height: th,
                    strokeColor: c.neg ? COLORS.neg : COLORS.mut,
                    fillColor: c.neg ? COLORS.negBg : "#eceef1",
                    roughness: 0,
                    text: lines.join("\n"),
                    fontSize: 12,
                    textAlign: "center",
                    textVerticalAlign: "middle",
                    meta: { kind: "end", condId: c.id },
                });
                addArrow(
                    { id, ax: 0.5, ay: 1 },
                    { id: tid, ax: 0, ay: 0.5 },
                    c.neg ? COLORS.neg : COLORS.mut,
                    "",
                    [0, 0],
                    { elbow: true }
                );
            }
        });
    });

    // terminal "success" marker after the last step
    const lastI = flow.steps.length - 1;
    if (success) {
    const endId = generateId();
    shapes.push({
        type: "shape",
        componentType: "rect",
        drawdyElementId: endId,
        frameId,
        x: stepX(lastI) + W + gapAfter[lastI],
        y: mainY + 30,
        width: 100,
        height: 60,
        strokeColor: COLORS.ok,
        fillColor: COLORS.okBg,
        roughness: 0,
        text: "Success",
        fontSize: 14,
        textAlign: "center",
        textVerticalAlign: "middle",
        meta: { kind: "end-ok" },
    });
    const lastNexts = arrowText(
        flow.steps[lastI].conds.filter((c) => c.action === "next").map((c) => c.label)
    );
    addArrow(
        { id: stepId[flow.steps[lastI].id], ax: 1, ay: 0.5 },
        { id: endId, ax: 0, ay: 0.5 },
        COLORS.ok,
        lastNexts,
        [stepX(lastI) + W + gapAfter[lastI] / 2, mainY + 46]
    );
    }

    const frame: DrawdyElementSchema = {
        type: "frame",
        drawdyElementId: frameId,
        name: opts.name ?? "E2E Flow",
        position: [ox, oy],
        width: stepX(lastI) + W + (success ? gapAfter[lastI] + 100 : 0) + PAD - ox,
        height: maxY + PAD - oy,
        rotation: 0,
        // canonical model lives on the board, so no localStorage is needed
        meta: opts.name ? { e2eCase: true } : { e2eFlow: flow },
    };

    return { frameId, elements: [frame, ...shapes, ...arrows], labels };
}
