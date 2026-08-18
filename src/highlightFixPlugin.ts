import { syntaxTree } from "@codemirror/language";
import type { SyntaxNodeRef } from "@lezer/common";
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

/**
 * In Obsidian's tree, a visual highlight `==a **b** c==` is NOT one node with
 * children — it is a contiguous run of sibling nodes that all carry
 * "highlight" in their name:
 *
 *   formatting-highlight  @29-31   "=="
 *   highlight             @31-36   "a "
 *   formatting-strong     @36-38   "**"   (also carries "highlight"!)
 *   highlight-strong      @38-49   "b"
 *   formatting-strong     @49-51   "**"
 *   highlight             @51-57   " c"
 *   formatting-highlight  @57-59   "=="
 *
 * Two highlights only count as separate runs when a gap between highlight
 * nodes exists (e.g. the plain text between `==a== ==b==`).
 */
interface HighlightRun {
	from: number;
	to: number;
	/** End of the first non-formatting content node. */
	firstContentTo: number | null;
	/** Start of the last non-formatting content node. */
	lastContentFrom: number | null;
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
				run = { from: node.from, to: node.to, firstContentTo: null, lastContentFrom: null };
				runs.push(run);
			}

			if (!isFormatting(node.name)) {
				if (run.firstContentTo === null) {
					run.firstContentTo = node.to;
				}
				run.lastContentFrom = node.from;
			}
		},
	});

	return runs;
}

function buildHighlightDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();

	for (const { from, to } of view.visibleRanges) {
		for (const run of collectRuns(from, to, view)) {
			const { firstContentTo, lastContentFrom } = run;

			if (firstContentTo === null || lastContentFrom === null) {
				// No visible content (e.g. `====`) — style the whole run.
				builder.add(run.from, run.to, decoSingle);
			} else if (firstContentTo >= lastContentFrom) {
				// Single content segment: one element with both rounded ends.
				builder.add(run.from, run.to, decoSingle);
			} else {
				// start: leading `==` + first content segment
				builder.add(run.from, firstContentTo, decoStart);
				// middle: inner formatting (`**`) + inner content segments
				builder.add(firstContentTo, lastContentFrom, decoMiddle);
				// end: last content segment + trailing `==`
				builder.add(lastContentFrom, run.to, decoEnd);
			}

			// TODO: remove — temporary debug logging, one line per run.
			debugLogRun(run, firstContentTo, lastContentFrom);
		}
	}

	return builder.finish();
}

// TODO: remove — temporary debug logging. Each run is logged once per session.
const loggedRuns = new Set<string>();
function debugLogRun(
	run: HighlightRun,
	firstContentTo: number | null,
	lastContentFrom: number | null,
): void {
	const key = `${run.from}-${run.to}`;
	if (!loggedRuns.has(key)) {
		loggedRuns.add(key);
		console.log(
			`[uimprove] run @${run.from}-${run.to}`,
			`start …${firstContentTo}`,
			`middle ${firstContentTo}…${lastContentFrom}`,
			`end ${lastContentFrom}…`,
		);
	}
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
