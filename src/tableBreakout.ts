import type UImprovePlugin from "./main";

/**
 * Table breakout.
 *
 * Tables are able to escape the usual line width while regular text keeps its cap.
 * Everything stays centered. Content-based table sizing (width: max-content) means
 * the full view width is only ever used when a table's content actually
 * demands it — tables wider than the view scroll in their wrapper.
 *
 * Pure CSS — native table layout is preserved — plus a post-processor
 * that tags table wrapper divs with a class, which is cheaper than a
 * :has() selector over the preview DOM.
 *
 * Adapted from the "Table Style Tweaks" community plugin.
 */

/** Live toggle state, consulted by the wrapper-tagging post-processor. */
export const tableBreakoutState = { enabled: true };

const BREAKOUT_CLASS = "uimprove-table-breakout";
const WRAPPER_CLASS = "uimprove-table-wrapper";

const STYLE_ID = "uimprove-table-breakout-styles";

const TABLE_BREAKOUT_CSS = `
/* Base: content-based width, centered (Obsidian's native rules beat
   plain auto margins — same as on text lines) */
.markdown-rendered table {
	width: max-content;
	margin-left: auto !important;
	margin-right: auto !important;
}

/* Reading view: the table's wrapper div is the scroll container, so a
   scrollbar (when content forces one) reaches every column. The wrapper
   is tagged with .uimprove-table-wrapper by the post-processor below. */
.markdown-preview-view .markdown-preview-section > div.uimprove-table-wrapper {
	overflow-x: auto;
}

/* Live Preview: no table sizing of our own — the widget's inline table
   editor (.table-editor) manages its column layout natively. The wrapper
   is fit-content natively; center narrow tables via auto margins. */
.markdown-source-view .cm-table-widget .table-wrapper {
	margin-inline: auto !important;
}

/* Reading mode: let the sizer span the whole view … */
body.uimprove-table-breakout .markdown-preview-view.is-readable-line-width .markdown-preview-sizer {
	max-width: none;
}

/* … then re-apply the line width to every block except table blocks
   (.mod-ui = collapse handles etc., .markdown-preview-pusher = layout helper) */
body.uimprove-table-breakout .markdown-preview-view.is-readable-line-width .markdown-preview-sizer > .mod-header,
body.uimprove-table-breakout .markdown-preview-view.is-readable-line-width .markdown-preview-sizer > .mod-footer,
body.uimprove-table-breakout .markdown-preview-view.is-readable-line-width .markdown-preview-section > div:not(.mod-ui):not(.markdown-preview-pusher):not(.uimprove-table-wrapper) {
	max-width: var(--file-line-width);
	margin-left: auto;
	margin-right: auto;
}

/* Live Preview: widen sizer/content */
body.uimprove-table-breakout .markdown-source-view.mod-cm6.is-readable-line-width .cm-sizer,
body.uimprove-table-breakout .markdown-source-view.mod-cm6.is-readable-line-width .cm-content {
	max-width: none;
}

/* Re-cap and re-center text lines. Current Obsidian caps lines natively
   but left-aligns them once the sizer is uncapped, and its rules beat
   plain margins — so claim the properties with !important and center
   with explicit math: half the container minus half the line width.
   :not() excludes the .cm-line of the table-editing widget's per-cell
   mini editors — the centering math is wildly negative inside narrow
   cells and would give every cell its own scrollbar. */
body.uimprove-table-breakout .markdown-source-view.mod-cm6.is-readable-line-width .cm-line:not(.cm-table-widget .cm-line) {
	max-width: var(--file-line-width) !important;
	margin-inline: calc(50% - var(--file-line-width) / 2) !important;
}

/* Inline title & properties hang off .cm-sizer in current Obsidian
   (formerly .cm-content) — cover both structures. */
body.uimprove-table-breakout .markdown-source-view.mod-cm6.is-readable-line-width .cm-sizer > .inline-title,
body.uimprove-table-breakout .markdown-source-view.mod-cm6.is-readable-line-width .cm-sizer > .metadata-container,
body.uimprove-table-breakout .markdown-source-view.mod-cm6.is-readable-line-width .cm-content > .inline-title,
body.uimprove-table-breakout .markdown-source-view.mod-cm6.is-readable-line-width .cm-content > .metadata-container {
	max-width: var(--file-line-width) !important;
	margin-inline: calc(50% - var(--file-line-width) / 2) !important;
}
`;

function injectTableBreakoutStyles(): void {
	if (document.getElementById(STYLE_ID)) {
		return;
	}
	const el = document.createElement("style");
	el.id = STYLE_ID;
	el.textContent = TABLE_BREAKOUT_CSS;
	document.head.appendChild(el);
}

/** Tags table wrapper divs so the CSS can target them with plain classes. */
export function tableBreakoutPostProcessor(el: HTMLElement): void {
	if (!tableBreakoutState.enabled) {
		return;
	}
	for (const table of Array.from(el.querySelectorAll("table"))) {
		table.parentElement?.classList.add(WRAPPER_CLASS);
	}
}

/** Applies (or removes) the breakout according to the toggle. */
export function applyTableBreakout(plugin: UImprovePlugin): void {
	tableBreakoutState.enabled = plugin.settings.tableBreakoutEnabled;
	document.body.classList.toggle(BREAKOUT_CLASS, plugin.settings.tableBreakoutEnabled);
	if (plugin.settings.tableBreakoutEnabled) {
		injectTableBreakoutStyles();
	} else {
		document.getElementById(STYLE_ID)?.remove();
	}
}

/** Removes every trace: styles, body class, wrapper tags. */
export function removeTableBreakoutTraces(): void {
	tableBreakoutState.enabled = false;
	document.getElementById(STYLE_ID)?.remove();
	document.body.classList.remove(BREAKOUT_CLASS);
	for (const el of Array.from(document.querySelectorAll(`.${WRAPPER_CLASS}`))) {
		el.classList.remove(WRAPPER_CLASS);
	}
}
