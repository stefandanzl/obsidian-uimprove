import {
	foldEffect,
	foldable,
	syntaxTree,
	syntaxTreeAvailable,
	unfoldEffect,
} from "@codemirror/language";
import type { SyntaxNodeRef } from "@lezer/common";
import { RangeSet, RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { Editor, Notice } from "obsidian";

/**
 * Collapsed sections.
 *
 * Headings whose text starts with the marker — a dash followed by a space
 * or end-of-line (`# -`, `# - `, `# - Actual heading text`) — are
 * automatically folded when the file opens. The marker stays in plain
 * Markdown so files stay portable and fold state needs no database.
 *
 * Live Preview hides the marker via a replacing decoration, so the heading
 * renders as its normal text; Reading view strips it in a post-processor.
 * The initial fold waits for the syntax tree (retrying until available),
 * then fires foldEffect with the section range from the language's fold
 * service — the same ranges Obsidian's fold gutter uses.
 *
 * Distinct from heading separators by construction: a separator heading's
 * ENTIRE text is 3+ dashes, which does not match the marker pattern.
 */

/** Live toggle state, consulted by the plugin and the post-processor. */
export const collapsedSectionsState = { enabled: true };

/** Heading line that carries the collapse marker. */
const MARKER_LINE = /^#{1,6}[ \t]+-( |$)/;

/** Heading CONTENT carries the marker: dash then space or end. */
function hasCollapseMarker(text: string): boolean {
	return /^-( |$)/.test(text);
}

function buildCollapseMarkerDecorations(view: EditorView): DecorationSet {
	if (!collapsedSectionsState.enabled) {
		return RangeSet.empty;
	}
	const builder = new RangeSetBuilder<Decoration>();
	// While the cursor is on a marker line, show the source — hiding the
	// dash under the typing cursor is bad UX.
	const selection = view.state.selection.main;

	for (const { from, to } of view.visibleRanges) {
		syntaxTree(view.state).iterate({
			from,
			to,
			enter: (node: SyntaxNodeRef) => {
				const name = node.name.toLowerCase();
				if (
					!name.includes("header") ||
					name.includes("formatting") ||
					name.includes("code")
				) {
					return;
				}
				const content = view.state.sliceDoc(node.from, node.to);
				if (name.match(/header-[1-6]/) && hasCollapseMarker(content)) {
					const line = view.state.doc.lineAt(node.from);
					const isCursorInLine =
						selection.to >= line.from && selection.from <= line.to;
					if (isCursorInLine) {
						return;
					}
					// Hide the marker: dash plus its one following space.
					const length = content.match(/^-( ?)/)![0].length;
					builder.add(
						node.from,
						node.from + length,
						Decoration.replace({}),
					);
				}
			},
		});
	}
	return builder.finish();
}

/**
 * Folds every marked heading in the document. Returns false while the
 * syntax tree is not fully parsed yet (caller retries).
 */
function foldMarkedHeadings(view: EditorView): boolean {
	if (!syntaxTreeAvailable(view.state, view.state.doc.length)) {
		return false;
	}
	const effects: ReturnType<typeof foldEffect.of>[] = [];
	const doc = view.state.doc;
	for (let i = 1; i <= doc.lines; i++) {
		const line = doc.line(i);
		if (!MARKER_LINE.test(line.text)) {
			continue;
		}
		// The section range from the language's fold service — the same
		// fold the gutter indicator would produce, not just the line.
		const range = foldable(view.state, line.from, line.to);
		if (range) {
			effects.push(foldEffect.of(range));
		}
	}
	if (effects.length > 0) {
		try {
			view.dispatch({ effects });
		} catch {
			// View may have been destroyed between load and fold.
		}
	}
	return true;
}

export const collapsedSectionsPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		private folded = false;

		constructor(view: EditorView) {
			this.decorations = buildCollapseMarkerDecorations(view);
			this.scheduleInitialFold(view);
		}

		update(update: ViewUpdate) {
			this.decorations = buildCollapseMarkerDecorations(update.view);
			this.scheduleInitialFold(update.view);
		}

		/** One initial fold per plugin instance (= per loaded document). */
		private scheduleInitialFold(view: EditorView): void {
			if (this.folded || !collapsedSectionsState.enabled) {
				return;
			}
			this.folded = true;
			// Deferred: dispatching during the update cycle is not allowed,
			// and the syntax tree may still be parsing on large documents.
			setTimeout(() => {
				if (!foldMarkedHeadings(view)) {
					// Tree not ready yet — retry until it is.
					this.folded = false;
				}
			}, 60);
		}

		destroy(): void {
			this.folded = true;
		}
	},
	{
		decorations: (v) => v.decorations,
	},
);

/**
 * Command "Toggle Collapsed Section": adds or removes the marker on the
 * heading of the section the cursor is in, then folds/unfolds that section
 * immediately for instant UI feedback.
 */
export function toggleCollapsedSection(editor: Editor): void {
	if (!collapsedSectionsState.enabled) {
		new Notice("Collapsed sections are disabled in UImprove settings.");
		return;
	}
	const view = (editor as unknown as { cm?: EditorView }).cm;
	if (!view) {
		return;
	}

	// Walk up from the cursor to the section's heading.
	let line = editor.getCursor().line;
	while (line >= 0 && !/^#{1,6}[ \t]+/.test(editor.getLine(line))) {
		line--;
	}
	if (line < 0) {
		new Notice("Cursor is not inside a heading section.");
		return;
	}

	const text = editor.getLine(line);
	const withMarker = text.match(/^(#{1,6}[ \t]+)(- ?)/);
	if (withMarker) {
		// Remove the marker and unfold the section. The end column is
		// prefix + marker length — the marker's length alone would be a
		// backwards range for any level above H1.
		const ch = withMarker[1].length;
		const from = { line, ch };
		const to = { line, ch: ch + withMarker[2].length };
		if (to.ch <= from.ch) {
			console.error(`[Collapsed Sections] backwards range occurred with from.ch: ${from.ch} and to.ch: ${to.ch}`)
			return; // defensive: never hand Obsidian a backwards range
		}
		editor.replaceRange("", from, to);
	} else {
		// Add the marker after the # marks.
		const ch = text.match(/^#{1,6}[ \t]+/)![0].length;
		editor.replaceRange("- ", { line, ch }, { line, ch });
	}

	// Fold/unfold via the fold service — positions from the post-edit state.
	const docLine = view.state.doc.line(line + 1);
	const range = foldable(view.state, docLine.from, docLine.to);
	if (!range) {
		return;
	}
	view.dispatch({
		effects: [
			withMarker ? unfoldEffect.of(range) : foldEffect.of(range),
		],
	});
}

/**
 * Reading view counterpart: hides the dash marker so the heading renders
 * normally. The element stays an <hN> (outline unaffected — that reads the
 * file cache, not the DOM).
 */
export function collapsedSectionsPostProcessor(el: HTMLElement): void {
	if (!collapsedSectionsState.enabled) {
		return;
	}
	for (const heading of Array.from(
		el.querySelectorAll("h1, h2, h3, h4, h5, h6"),
	)) {
		if (!hasCollapseMarker(heading.textContent ?? "")) {
			continue;
		}
		// Strip the marker (dash + one space) from the first text node so
		// nested formatting in the rest of the heading survives.
		const first = heading.firstChild;
		if (first && first.nodeType === Node.TEXT_NODE) {
			first.textContent = (first.textContent ?? "").replace(/^-( ?)/, "");
		} else {
			heading.textContent = (heading.textContent ?? "").replace(/^-( ?)/, "");
		}
	}
}
