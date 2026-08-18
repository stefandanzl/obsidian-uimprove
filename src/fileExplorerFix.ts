import { around } from "monkey-around";
import type { EventRef } from "obsidian";
import type { App } from "obsidian";
import type UImprovePlugin from "./main";

/**
 * File explorer indent fix.
 *
 * Obsidian compensates its nested-tree indentation by writing inline
 * `margin-inline-start` / `padding-inline-start` onto every
 * `.tree-item-self` row — the two always sum to a constant, so the inline
 * styles exist purely to cancel the nesting. Removing them hands indentation
 * control back to CSS.
 *
 * Applied at the source: the FileItem prototype methods that (re)write the
 * styles (`onRender`, `setCollapsed`) are patched with monkey-around to
 * strip the properties right after they run. An initial sweep plus a
 * layout-change hook covers already-rendered rows and explorers opened
 * later. Folder AND file rows are both covered (`.tree-item-self`).
 */

/** Live toggle state, consulted by the patch wrappers. */
export const fileExplorerFixState = { enabled: true };

type FileItemLike = {
	selfEl?: HTMLElement;
	titleEl?: HTMLElement;
	onRender?: () => void;
};

type FileExplorerViewLike = {
	fileItems?: Record<string, FileItemLike>;
	containerEl?: HTMLElement;
};

/** Uninstallers for the installed prototype patches. */
let uninstalls: (() => void)[] = [];
/** Prototypes that currently carry a patch (re-bind protection). */
const patchedProtos = new Set<object>();
/** The layout-change binding, kept so toggling off can remove it. */
let layoutRef: EventRef | null = null;
let layoutWorkspace: import("obsidian").Workspace | null = null;

function stripInlineIndent(el: HTMLElement): void {
	el.style.removeProperty("margin-inline-start");
	el.style.removeProperty("padding-inline-start");
}

function stripItem(item: FileItemLike): void {
	const el = item.selfEl ?? item.titleEl;
	if (el) {
		stripInlineIndent(el);
	}
}

/**
 * Strips every item's element directly — via the fileItems objects, not the
 * DOM. The initial lazy render writes the inline styles in the FileItem
 * constructor, so the elements exist (and are styled) before they are ever
 * inserted; cleaning them here means they enter the DOM already clean. Later
 * re-renders run through the patched onRender/setCollapsed.
 */
function sweep(view: FileExplorerViewLike): void {
	let stripped = 0;
	for (const key of Object.keys(view.fileItems ?? {})) {
		const el = view.fileItems![key].selfEl ?? view.fileItems![key].titleEl;
		if (el) {
			stripInlineIndent(el);
			stripped++;
		}
	}
	// TODO: remove — temporary debug logging.
	console.log(`[uimprove-fe] sweep: stripped ${stripped} item elements`);
}

/** Wraps a prototype method so the row's inline indent is stripped after it. */
function wrapStripping(
	old: (...args: unknown[]) => unknown,
): (this: FileItemLike, ...args: unknown[]) => unknown {
	return function (this: FileItemLike, ...args: unknown[]) {
		const result = old.apply(this, args);
		if (fileExplorerFixState.enabled) {
			stripItem(this);
		}
		return result;
	};
}

/**
 * Patches the prototype chain of one file-explorer view's items once.
 * Folder and file items sit on different prototypes — every prototype in
 * the chain that carries a relevant method gets the wrapper.
 */
function bindExplorerView(view: FileExplorerViewLike): void {
	const keys = Object.keys(view.fileItems ?? {});
	// TODO: remove — temporary debug logging.
	console.log(`[uimprove-fe] bind: ${keys.length} fileItems`);
	for (const key of keys) {
		const item = view.fileItems![key];
		let proto: object | null = Object.getPrototypeOf(item);
		while (proto && proto !== Object.prototype) {
			if (!patchedProtos.has(proto)) {
				const patch: Record<string, (old: never) => unknown> = {};
				const candidates = proto as Record<string, unknown>;
				if (typeof candidates.onRender === "function") {
					patch.onRender = wrapStripping as never;
				}
				if (typeof candidates.setCollapsed === "function") {
					patch.setCollapsed = wrapStripping as never;
				}
				if (Object.keys(patch).length > 0) {
					patchedProtos.add(proto);
					uninstalls.push(around(proto as object, patch as never));
					// TODO: remove — temporary debug logging.
					console.log(
						`[uimprove-fe] patched: ${Object.keys(patch).join(", ")}`,
					);
				}
			}
			proto = Object.getPrototypeOf(proto);
		}
	}
	sweep(view);
}

function explorerViews(app: App): FileExplorerViewLike[] {
	return app.workspace
		.getLeavesOfType("file-explorer")
		.map((leaf) => (leaf as unknown as { view: FileExplorerViewLike }).view);
}

export function applyFileExplorerFix(plugin: UImprovePlugin): void {
	fileExplorerFixState.enabled = plugin.settings.fileExplorerFixEnabled;
	if (plugin.settings.fileExplorerFixEnabled) {
		activateFileExplorerFix(plugin);
	} else {
		deactivateFileExplorerFix();
	}
}

function activateFileExplorerFix(plugin: UImprovePlugin): void {
	const bindAll = (): void => {
		for (const view of explorerViews(plugin.app)) {
			bindExplorerView(view);
		}
	};

	// onload can run before the workspace layout exists — fileItems would be
	// empty and no prototype would ever get patched. Bind once ready.
	if (plugin.app.workspace.layoutReady) {
		bindAll();
	} else {
		plugin.app.workspace.onLayoutReady(bindAll);
	}

	// Explorers mounted later (new pane, layout restore) need binding too.
	layoutWorkspace = plugin.app.workspace;
	layoutRef = plugin.app.workspace.on("layout-change", () => {
		if (!fileExplorerFixState.enabled) {
			return;
		}
		bindAll();
	});
}

/**
 * Removes patches and the layout hook. Rows already stripped stay stripped
 * until Obsidian re-renders them (which then writes its inline styles back).
 */
export function deactivateFileExplorerFix(): void {
	for (const uninstall of uninstalls) {
		uninstall();
	}
	uninstalls = [];
	patchedProtos.clear();
	if (layoutRef && layoutWorkspace) {
		layoutWorkspace.offref(layoutRef);
	}
	layoutRef = null;
	layoutWorkspace = null;
}
