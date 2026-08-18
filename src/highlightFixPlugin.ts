import {
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";

/**
 * Highlight continuity fix, DOM-pass edition.
 *
 * `==a **b** c==` renders as several separate native `span.cm-highlight`
 * boxes (one per formatting run). CodeMirror never merges foreign
 * Decoration.mark instances onto native spans — it nests new elements — so
 * instead of decorating, we walk the finished DOM after each render and add
 * positional classes directly to Obsidian's own spans:
 *
 *   <span class="cm-highlight uimprove-highlight-start">a </span>
 *   <span class="cm-highlight cm-strong">b</span>
 *   <span class="cm-highlight uimprove-highlight-end"> c</span>
 *
 * Visible `==` / `**` delimiter spans carry `cm-highlight` themselves and are
 * ordinary run members; while the cursor is elsewhere they are widget-hidden
 * and simply absent from the DOM, which puts the rounding at the content
 * edges for free.
 */

const POSITION_CLASSES = ["uimprove-highlight-start", "uimprove-highlight-end"];

const CLEANUP_SELECTOR = POSITION_CLASSES.map((c) => `.${c}`).join(", ");

function applyHighlightClasses(view: EditorView): void {
	// Obsidian replaces spans asynchronously and can detach nodes while this
	// pass iterates its snapshot — never let that kill the whole pass
	// silently (a thrown error here leaves runs untagged until the next
	// editor update, which shows up as a visible flicker).
	try {
		applyHighlightClassesInner(view);
	} catch (e) {
		console.error("[uimprove] highlight pass failed:", e);
	}
}

function applyHighlightClassesInner(view: EditorView): void {
	// Clean up the previous pass first. Queried by our own classes (not by
	// .cm-highlight) so elements that lost their native class but kept ours
	// are caught as well.
	for (const el of Array.from(view.dom.querySelectorAll(CLEANUP_SELECTOR))) {
		el.classList.remove(...POSITION_CLASSES);
	}

	const highlights = Array.from(
		view.dom.querySelectorAll("span.cm-highlight"),
	);
	if (highlights.length === 0) {
		return;
	}

	let run: Element[] = [];
	for (let i = 0; i < highlights.length; i++) {
		const current = highlights[i];
		if (
			run.length > 0 &&
			isConsecutive(run[run.length - 1], current)
		) {
			run.push(current);
		} else {
			if (run.length > 0) {
				tagRun(run);
			}
			run = [current];
		}
	}
	if (run.length > 0) {
		tagRun(run);
	}
}

/**
 * Whether two highlight spans belong to the same visual highlight: same line
 * element, and nothing but widget buffers and non-highlight formatting spans
 * between them. Any visible content in between — including a bare text node
 * like the space in `==a== ==b==` — separates the runs.
 */
function isConsecutive(a: Element, b: Element): boolean {
	// Either span may have been detached from the DOM between the
	// querySelectorAll snapshot and this check — treat that as "not a run".
	const parent = b.parentNode;
	if (!parent || a.parentNode !== parent) {
		return false;
	}

	const siblings = parent.childNodes;
	let inGap = false;
	for (let i = 0; i < siblings.length; i++) {
		const node = siblings[i];
		if (node === a) {
			inGap = true;
			continue;
		}
		if (node === b) {
			return inGap;
		}
		if (!inGap) {
			continue;
		}
		if (node.nodeType === Node.TEXT_NODE) {
			// Text nodes between the spans mean visible characters —
			// including the space between two separate highlights.
			return false;
		}
		const el = node as Element;
		if (
			el.classList.contains("cm-widgetBuffer") ||
			el.classList.contains("cm-formatting")
		) {
			continue;
		}
		// Empty placeholder elements (the contenteditable="false" spans
		// Obsidian pairs with widget buffers) render nothing visible.
		if (el.childElementCount === 0 && (el.textContent ?? "").length === 0) {
			continue;
		}
		return false;
	}
	return false;
}

function tagRun(run: Element[]): void {
	if (run.length === 1) {
		run[0].classList.add(
			"uimprove-highlight-start",
			"uimprove-highlight-end",
		);
	} else {
		run[0].classList.add("uimprove-highlight-start");
		run[run.length - 1].classList.add("uimprove-highlight-end");
		// Intermediate spans keep no positional class — their native
		// .cm-highlight styling is already correct for run middles.
	}

	// TODO: remove — temporary debug logging, one line per distinct run.
	debugLogRun(run);
}

// TODO: remove — temporary debug logging. Each run is logged once per session.
const loggedRuns = new Set<string>();
function debugLogRun(run: Element[]): void {
	const text = run.map((el) => el.textContent ?? "").join("");
	if (!loggedRuns.has(text)) {
		loggedRuns.add(text);
		console.log(`[uimprove] run (${run.length} spans): "${text}"`);
	}
}

export const highlightFixPlugin = ViewPlugin.fromClass(
	class {
		private observer: MutationObserver;

		constructor(view: EditorView) {
			// Obsidian swaps some spans into the DOM asynchronously (e.g. the
			// visible `==` / `**` delimiters when the cursor enters a
			// highlight), after the update cycle has already run. Watching for
			// span insertions/removals re-tags those late arrivals.
			this.observer = new MutationObserver(() => applyHighlightClasses(view));
			// childList only — classList changes are attribute mutations, so
			// our own tagging cannot re-trigger the observer.
			this.observer.observe(view.dom, { childList: true, subtree: true });

			applyHighlightClasses(view);
		}

		update(update: ViewUpdate) {
			// Runs on every update, synchronously within the update cycle
			// (before the browser paints). Doc changes, viewport changes and
			// cursor moves all reshape the runs — cursor moves decide whether
			// the `==` / `**` delimiter spans are visible at all.
			applyHighlightClasses(update.view);
		}

		destroy() {
			this.observer.disconnect();
		}
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
