import type UImprovePlugin from "./main";

/**
 * Stretch tables.
 *
 * Tables narrower than the available width are stretched up to it (line
 * width without breakout, view width with); wide tables are bounded by it
 * and wrap instead of scrolling. A clamp around the width model in
 * effect: min-width stretches narrow tables, max-width bounds wide ones.
 *
 * Pure CSS, independent of the table breakout feature.
 */

const STRETCH_CLASS = "uimprove-table-stretch";

const STYLE_ID = "uimprove-table-stretch-styles";

const TABLE_STRETCH_CSS = `
body.uimprove-table-stretch .markdown-rendered table {
	min-width: min(100%, var(--file-line-width));
	max-width: 100%;
}

/* Live Preview: the widget's table editor fills its wrapper natively —
   clamp the wrapper instead. */
body.uimprove-table-stretch .markdown-source-view .cm-table-widget .table-wrapper {
	min-width: min(100%, var(--file-line-width));
	max-width: 100%;
}
`;

function injectTableStretchStyles(): void {
	if (document.getElementById(STYLE_ID)) {
		return;
	}
	const el = document.createElement("style");
	el.id = STYLE_ID;
	el.textContent = TABLE_STRETCH_CSS;
	document.head.appendChild(el);
}

/** Applies (or removes) the stretch according to the toggle. */
export function applyTableStretch(plugin: UImprovePlugin): void {
	document.body.classList.toggle(STRETCH_CLASS, plugin.settings.tableStretchEnabled);
	if (plugin.settings.tableStretchEnabled) {
		injectTableStretchStyles();
	} else {
		document.getElementById(STYLE_ID)?.remove();
	}
}

/** Removes every trace: styles, body class. */
export function removeTableStretchTraces(): void {
	document.getElementById(STYLE_ID)?.remove();
	document.body.classList.remove(STRETCH_CLASS);
}
