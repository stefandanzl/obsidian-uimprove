import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { RangeSetBuilder } from "@codemirror/state";
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

function isHighlightNode(name: string): boolean {
	const lower = name.toLowerCase();
	return lower.includes("highlight") && !lower.includes("formatting");
}

// TODO: remove — temporary debug logging to discover the actual node names
// Obsidian's tree uses. Each distinct name is logged once per session, so the
// console shows the full node vocabulary without spamming on every keystroke.
const loggedNodeNames = new Set<string>();
function debugLogNodeName(name: string): void {
	if (name && !loggedNodeNames.has(name)) {
		loggedNodeNames.add(name);
		console.log(`[uimprove] syntax node: "${name}"`);
	}
}

/**
 * Splits a highlight node into its visible content segments.
 *
 * Obsidian renders `==a **b** c==` as separate `.cm-highlight` boxes (one per
 * inline segment: "a ", "**b**", " c"), which is why border-radius applied via
 * plain `.cm-highlight` rounds every box. The segments returned here mirror
 * those render boundaries: text runs between child nodes, plus each
 * non-formatting child node itself. Formatting children (the `==` marks) are
 * excluded so classes never land on hidden zero-visual elements.
 */
function contentSegments(node: SyntaxNode): { from: number; to: number }[] {
	const segments: { from: number; to: number }[] = [];
	let pos = node.from;

	for (let child = node.firstChild; child; child = child.nextSibling) {
		// Text run before this child (only when non-empty).
		if (child.from > pos) {
			segments.push({ from: pos, to: child.from });
		}
		// Non-formatting children (strong, em, links, ...) are content
		// segments of their own; formatting marks are skipped.
		if (child.to > child.from && !child.name.toLowerCase().includes("formatting")) {
			segments.push({ from: child.from, to: child.to });
		}
		pos = Math.max(pos, child.to);
	}
	// Trailing text run after the last child.
	if (node.to > pos) {
		segments.push({ from: pos, to: node.to });
	}

	return segments;
}

function buildHighlightDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();

	for (const { from, to } of view.visibleRanges) {
		syntaxTree(view.state).iterate({
			from,
			to,
			enter: (node) => {
				// TODO: remove — temporary debug logging to discover the
				// actual node names Obsidian's tree uses.
				debugLogNodeName(node.name);

				if (!isHighlightNode(node.name)) {
					return;
				}

				const segments = contentSegments(node.node);
				const count = segments.length;
				for (let i = 0; i < count; i++) {
					const { from, to } = segments[i];
					let deco: Decoration;
					if (count === 1) {
						deco = decoSingle;
					} else if (i === 0) {
						deco = decoStart;
					} else if (i === count - 1) {
						deco = decoEnd;
					} else {
						deco = decoMiddle;
					}
					// RangeSetBuilder requires additions sorted by from,
					// which holds: segments are in document order and we
					// never descend into a processed highlight node.
					builder.add(from, to, deco);
				}

				// Nested highlight nodes inside this one are already covered
				// by the segments above.
				return false;
			},
		});
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
	for (const mark of Array.from(el.querySelectorAll("mark"))) {
		mark.classList.add("uimprove-highlight-start", "uimprove-highlight-end");
	}
}
