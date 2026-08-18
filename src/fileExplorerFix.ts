import { around } from "monkey-around";
import type { App } from "obsidian";
import type UImprovePlugin from "./main";

/** Live toggle state, consulted by the patch wrappers. */
export const fileExplorerFixState = { enabled: true };

type FileItemLike = {
	selfEl?: HTMLElement;
	titleEl?: HTMLElement;
	/** Carries the inline indent compensation written by the tree renderer. */
	coverEl?: HTMLElement;
};

type FileExplorerViewLike = {
	fileItems?: Record<string, FileItemLike>;
};

/** Uninstallers for the installed prototype patches. */
let uninstalls: (() => void)[] = [];
/** Prototypes that currently carry a patch (re-bind protection). */
const patchedProtos = new Set<object>();

function stripInlineIndent(el: HTMLElement): void {
	el.style.removeProperty("margin-inline-start");
	el.style.removeProperty("padding-inline-start");
}

function stripItem(item: FileItemLike): void {
	const el = item.selfEl ?? item.titleEl;
	if (el) {
		stripInlineIndent(el);
	}
	const cover = item.coverEl;
	if (cover) {
		queueMicrotask(() => stripInlineIndent(cover));
	}
}

/** One-time pass over existing items — covers toggling the setting back on. */
function sweep(view: FileExplorerViewLike): void {
	for (const key of Object.keys(view.fileItems ?? {})) {
		stripItem(view.fileItems![key]);
	}
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
 * the chain that carries a relevant method gets the wrapper. Prototypes are
 * shared by every explorer view, so panes mounted later are covered too.
 */
function bindExplorerView(view: FileExplorerViewLike): void {
	for (const key of Object.keys(view.fileItems ?? {})) {
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
}

/**
 * Removes the patches. Rows already stripped stay stripped until Obsidian
 * re-renders them (which then writes its inline styles back).
 */
export function deactivateFileExplorerFix(): void {
	for (const uninstall of uninstalls) {
		uninstall();
	}
	uninstalls = [];
	patchedProtos.clear();
}
