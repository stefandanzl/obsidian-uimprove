import { syntaxTree } from "@codemirror/language";
import type { SyntaxNodeRef } from "@lezer/common";
import { RangeSet, RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";

// Pre-instantiated decorations: Decoration.mark objects are immutable and
// should be shared instead of recreated on every rebuild.
const decoStart = Decoration.mark({ class: "uimprove-highlight-start" });
const decoMiddle = Decoration.mark({ class: "uimprove-highlight-middle" });
const decoEnd = Decoration.mark({ class: "uimprove-highlight-end" });
const decoSingle = Decoration.mark({
	class: "uimprove-highlight-start uimprove-highlight-end",
});

/**
 * Live toggle state, kept in a shared object so the ViewPlugin, the reading
 * view post-processor and the style injection all consult the same source.
 */
export const highlightFixState = { enabled: true };

const STYLE_ID = "uimprove-highlight-fix-styles";

/** The highlight fix CSS, injected as a <style> element only while enabled. */
const HIGHLIGHT_FIX_CSS = `
:root {
	/* You can use your own css snippet overrides here too */
	--uimprove-highlight-bg: var(--uimprove-user-highlight-bg, rgb(0 100 50 / 50%));
    --uimprove-highlight-text: var(--uimprove-user-highlight-text, rgb(0 255 69 / 91%));
    --uimprove-highlight-radius: var(--uimprove-user-highlight-radius, 0.5em);
}

/* Editor (Live Preview): disable the native, square highlight boxes … */
.cm-s-obsidian span.cm-highlight {
	background-color: transparent;
}

.cm-s-obsidian span.cm-highlight, .markdown-rendered mark, mark {
    color: var(--uimprove-highlight-text);
    box-decoration-break: clone; 
}

.markdown-rendered mark, mark {
	background-color: var(--uimprove-highlight-bg);
    border-radius: var(--uimprove-highlight-radius);
	padding: 0 8px 2px 8px;
}

/* … and paint our own continuous one. */
.cm-s-obsidian .uimprove-highlight-start,
.cm-s-obsidian .uimprove-highlight-middle,
.cm-s-obsidian .uimprove-highlight-end {
	background-color: var(--uimprove-highlight-bg);
	padding-top: 0;
    padding-bottom: 2px;

	/* This can be buggy because it only shows the decorations, 
	it would normally have by design! */
	box-decoration-break: clone;
}

.cm-s-obsidian .uimprove-highlight-start {
	border-top-left-radius: var(--uimprove-highlight-radius);
	border-bottom-left-radius: var(--uimprove-highlight-radius);
	padding-left: 8px;
}

.cm-s-obsidian .uimprove-highlight-middle {
	border-radius: 0;
}

.cm-s-obsidian .uimprove-highlight-end {
	border-top-right-radius: var(--uimprove-highlight-radius);
	border-bottom-right-radius: var(--uimprove-highlight-radius);
	padding-right: 8px;
}

.cm-s-obsidian span.cm-formatting.cm-formatting-highlight.cm-highlight {
	background-color: var(--uimprove-highlight-bg);
}
`;

export function injectHighlightFixStyles(): void {
	if (document.getElementById(STYLE_ID)) {
		return;
	}
	const el = document.createElement("style");
	el.id = STYLE_ID;
	el.textContent = HIGHLIGHT_FIX_CSS;
	document.head.appendChild(el);
}

export function removeHighlightFixStyles(): void {
	document.getElementById(STYLE_ID)?.remove();
}

interface HighlightRun {
	from: number;
	to: number;
	/** Start of the first non-formatting content node. */
	firstContentFrom: number | null;
	/** End of the first non-formatting content node. */
	firstContentTo: number | null;
	/** Start of the last non-formatting content node. */
	lastContentFrom: number | null;
	/** End of the last non-formatting content node. */
	lastContentTo: number | null;
}

function hasHighlight(name: string): boolean {
	return name.toLowerCase().includes("highlight");
}

function isFormatting(name: string): boolean {
	return name.toLowerCase().includes("formatting");
}

function collectRuns(rootFrom: number, rootTo: number, view: EditorView): HighlightRun[] {
	const runs: HighlightRun[] = [];
	let run: HighlightRun | null = null;

	syntaxTree(view.state).iterate({
		from: rootFrom,
		to: rootTo,
		enter: (node: SyntaxNodeRef) => {
			if (!hasHighlight(node.name)) {
				return;
			}

			// Continue the current run only if this node attaches seamlessly.
			if (run && node.from <= run.to) {
				run.to = Math.max(run.to, node.to);
			} else {
				run = {
					from: node.from,
					to: node.to,
					firstContentFrom: null,
					firstContentTo: null,
					lastContentFrom: null,
					lastContentTo: null,
				};
				runs.push(run);
			}

			if (!isFormatting(node.name)) {
				if (run.firstContentFrom === null) {
					run.firstContentFrom = node.from;
					run.firstContentTo = node.to;
				}
				run.lastContentFrom = node.from;
				run.lastContentTo = node.to;
			}
		},
	});

	return runs;
}

function buildHighlightDecorations(view: EditorView): DecorationSet {
	if (!highlightFixState.enabled) {
		return RangeSet.empty;
	}

	const builder = new RangeSetBuilder<Decoration>();

	for (const { from, to } of view.visibleRanges) {
		for (const run of collectRuns(from, to, view)) {
			const { firstContentFrom, firstContentTo, lastContentFrom, lastContentTo } = run;

			// Abbrechen, wenn kein verwertbarer Inhaltsknoten existiert (z.B. `====`)
			if (!firstContentFrom || !firstContentTo || !lastContentFrom || !lastContentTo) {
				continue;
			}

			if (firstContentTo >= lastContentFrom) {
				// Einziges Textsegment: Das gesamte Element bekommt -start UND -end
				builder.add(firstContentFrom, lastContentTo, decoSingle);
			} else {
				// 1. Erstes Textsegment bekommt -start (== bleiben eckig)
				builder.add(firstContentFrom, firstContentTo, decoStart);

				// 2. Mittlerer Teil bekommt -middle
				if (firstContentTo < lastContentFrom) {
					builder.add(firstContentTo, lastContentFrom, decoMiddle);
				}

				// 3. Letztes Textsegment bekommt -end (== bleiben eckig)
				builder.add(lastContentFrom, lastContentTo, decoEnd);
			}
		}
	}

	return builder.finish();
}

export const highlightFixPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = buildHighlightDecorations(view);
		}

		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged) {
				this.decorations = buildHighlightDecorations(update.view);
			}
		}
	},
	{
		decorations: (v) => v.decorations,
	},
);

/**
 * Reading view counterpart. `==marked==` text renders as a single continuous
 * `<mark>` element there, so it gets start + end classes together — the added
 * classes just let the same CSS selectors style both editor and reading view.
 */
export function highlightPostProcessor(el: HTMLElement): void {
	if (!highlightFixState.enabled) {
		return;
	}
	for (const mark of Array.from(el.querySelectorAll("mark"))) {
		mark.classList.add("uimprove-highlight-start", "uimprove-highlight-end");
	}
}
