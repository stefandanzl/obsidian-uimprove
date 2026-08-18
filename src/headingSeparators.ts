import { syntaxTree } from "@codemirror/language";
import type { SyntaxNodeRef } from "@lezer/common";
import { RangeSet, RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view";

/**
 * Heading separators.
 *
 * A heading whose entire text is 3+ dashes (`# ---`, `## -----`, …) renders
 * as a horizontal separator line instead of a heading — colored by its
 * heading level via the theme's --h1-color … --h6-color variables. The
 * heading stays a real heading: outline, folding and # navigation keep
 * working; only the rendering changes.
 *
 * Live Preview replaces the dash run with a widget that sits at the text
 * position, so the per-level indentation comes for free. Reading view
 * rewrites the <hN> content the same way in a post-processor.
 */

/** Live toggle state, consulted by the plugin and the post-processor. */
export const headingSeparatorState = { enabled: true };

const STYLE_ID = "uimprove-heading-separator-styles";

const HEADING_SEPARATOR_CSS = `
:root {
    --uimprove-separator-base-thickness: 1.5px;
}


.uimprove-separator-1 { 
	--uimprove-separator-color: var(--h1-color);
	--uimprove-separator-thickness: calc(var(--uimprove-separator-base-thickness) * 3.6);
}
.uimprove-separator-2 { 
	--uimprove-separator-color: var(--h2-color);
	--uimprove-separator-thickness: calc(var(--uimprove-separator-base-thickness) * 2.8);
}
.uimprove-separator-3 { 
	--uimprove-separator-color: var(--h3-color);
	--uimprove-separator-thickness: calc(var(--uimprove-separator-base-thickness) * 2.2);
}
.uimprove-separator-4 { 
	--uimprove-separator-color: var(--h4-color); 
	--uimprove-separator-thickness: calc(var(--uimprove-separator-base-thickness) * 1.8);
}
.uimprove-separator-5 { 
	--uimprove-separator-color: var(--h5-color);
	--uimprove-separator-thickness: calc(var(--uimprove-separator-base-thickness) * 1.4);
}
.uimprove-separator-6 { 
	--uimprove-separator-color: var(--h6-color);
	--uimprove-separator-thickness: calc(var(--uimprove-separator-base-thickness) * 1.0);
}


span.uimprove-separator {
	flex-grow: 1;
	border-top: var(--uimprove-separator-thickness) solid var(--uimprove-separator-color, var(--caret-color));
}


.markdown-source-view .cm-line:has(.uimprove-separator) {
    display: flex !important;
    align-items: center !important;
}
`;

export function injectHeadingSeparatorStyles(): void {
	if (document.getElementById(STYLE_ID)) {
		return;
	}
	const el = document.createElement("style");
	el.id = STYLE_ID;
	el.textContent = HEADING_SEPARATOR_CSS;
	document.head.appendChild(el);
}

export function removeHeadingSeparatorStyles(): void {
	document.getElementById(STYLE_ID)?.remove();
}

class SeparatorWidget extends WidgetType {
	constructor(private level: number) {
		super();
	}

	eq(other: SeparatorWidget): boolean {
		return other.level === this.level;
	}

	toDOM(): HTMLElement {
		const el = document.createElement("span");
		el.className = `uimprove-separator uimprove-separator-${this.level}`;
		return el;
	}
}

/** Heading content text that means "separator": three or more dashes. */
function isSeparatorText(text: string): boolean {
	return /^-{3,}$/.test(text.trim());
}

function buildHeadingSeparatorDecorations(view: EditorView): DecorationSet {
	if (!headingSeparatorState.enabled) {
		return RangeSet.empty;
	}

	const builder = new RangeSetBuilder<Decoration>();
	// Haupt-Cursor/Selection abfragen
	const selection = view.state.selection.main;

	for (const { from, to } of view.visibleRanges) {
		syntaxTree(view.state).iterate({
			from,
			to,
			enter: (node: SyntaxNodeRef) => {
				const name = node.name.toLowerCase();

				if (!name.includes("header") || name.includes("formatting") || name.includes("code")) {
					return;
				}

				const level = name.match(/header-([1-6])/);
				if (level && isSeparatorText(view.state.sliceDoc(node.from, node.to))) {
					// Zeile der aktuellen Syntax-Node ermitteln
					const line = view.state.doc.lineAt(node.from);

					// Wenn der Cursor/Selection-Bereich die Zeile berührt -> Dekoration überspringen (Klartext anzeigen)
					const isCursorInLine = selection.to >= line.from && selection.from <= line.to;

					if (!isCursorInLine) {
						builder.add(
							node.from,
							node.to,
							Decoration.replace({ widget: new SeparatorWidget(Number(level[1])) }),
						);
					}
				}
			},
		});
	}
	return builder.finish();
}

export const headingSeparatorPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = buildHeadingSeparatorDecorations(view);
		}

		update(update: ViewUpdate) {
			// Re-Render erzwingen wenn Text, Viewport ODER Cursor/Selection sich ändert
			if (update.docChanged || update.viewportChanged || update.selectionSet) {
				this.decorations = buildHeadingSeparatorDecorations(update.view);
			}
		}
	},
	{
		decorations: (v) => v.decorations,
	},
);

/**
 * Reading view counterpart: <hN> whose text is only dashes becomes a
 * separator line. The element stays an <hN>, so the outline is unaffected.
 */
export function headingSeparatorPostProcessor(el: HTMLElement): void {
	if (!headingSeparatorState.enabled) {
		return;
	}
	for (const heading of Array.from(el.querySelectorAll("h1, h2, h3, h4, h5, h6"))) {
		if (!isSeparatorText(heading.textContent ?? "")) {
			continue;
		}
		const level = heading.tagName[1];
		heading.empty();
		heading.classList.add("uimprove-hsep");
		heading.createSpan({
			cls: `uimprove-separator uimprove-separator-${level}`,
		});
	}
}
