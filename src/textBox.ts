import type { DrawdyElementSchema } from "@drawdy/driver-protocol";

/**
 * Notes the extension puts on the board (the starter note, the scenario notes, hints):
 * a rectangle with a text label and a coloured fill. Unlike a sticky note, a rectangle
 * takes any width and height, so each note is sized to fit its text (OUT-50).
 */

export type Tone = "blue" | "pink" | "green" | "orange" | "yellow" | "amber" | "red";

/** The colour of the text in every text box. */
export const TEXT_COLOR = "#000000";

/** Light fill, and a darker shade of it for the border (the text is TEXT_COLOR). */
export const TONES: Record<Tone, { fill: string; ink: string }> = {
    blue: { fill: "#dbeafe", ink: "#1e3a8a" },
    pink: { fill: "#fce7f3", ink: "#9d174d" },
    green: { fill: "#dcfce7", ink: "#166534" },
    orange: { fill: "#ffedd5", ink: "#9a3412" },
    yellow: { fill: "#fef9c3", ink: "#854d0e" },
    amber: { fill: "#fde68a", ink: "#78350f" },
    red: { fill: "#fee2e2", ink: "#991b1b" },
};

/** Width of a character and height of a line, as a share of the font size. */
const CHAR_W = 0.6;
const LINE_H = 1.4;
/** Space between the border and the text. */
export const BOX_PAD = 12;

/** How many lines `text` takes when wrapped to a box `width` wide. */
export function textRows(text: string, width: number, fontSize: number): number {
    const perLine = Math.max(8, Math.floor((width - 2 * BOX_PAD) / (fontSize * CHAR_W)));
    return text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
}

/** The height that fits `text` in a box `width` wide. */
export function fitHeight(text: string, width: number, fontSize: number): number {
    return Math.ceil(2 * BOX_PAD + textRows(text, width, fontSize) * fontSize * LINE_H);
}

export type TextBoxOptions = {
    id: string;
    frameId?: string;
    x: number;
    y: number;
    width: number;
    /** Default: the height that fits the text. */
    height?: number;
    text: string;
    fontSize: number;
    tone: Tone;
    meta?: Record<string, any>;
};

/** A filled text box, left-aligned from the top, sized to its text. */
export function textBox(o: TextBoxOptions): DrawdyElementSchema {
    const { fill, ink } = TONES[o.tone];
    return {
        type: "shape",
        componentType: "rect",
        drawdyElementId: o.id,
        ...(o.frameId ? { frameId: o.frameId } : {}),
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height ?? fitHeight(o.text, o.width, o.fontSize),
        strokeColor: ink,
        fillColor: fill,
        // the text is always black, whatever the fill (OUT-50)
        textColor: TEXT_COLOR,
        strokeWidth: 1.5,
        cornerRadius: 8,
        roughness: 0,
        text: o.text,
        fontSize: o.fontSize,
        textAlign: "left",
        textVerticalAlign: "top",
        ...(o.meta ? { meta: o.meta } : {}),
    } as DrawdyElementSchema;
}
