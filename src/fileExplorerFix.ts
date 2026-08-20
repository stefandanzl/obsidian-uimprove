import { around } from "monkey-around";
import { Notice, type App } from "obsidian";
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
 *
 * Work is O(item classes), not O(items): once an item's direct prototype
 * has been seen, its whole chain has been processed (ancestors are shared),
 * so every further item of that class is a single Set lookup and a skip.
 */
function bindExplorerView(view: FileExplorerViewLike): void {
	const visited = new Set<object>();
	for (const key of Object.keys(view.fileItems ?? {})) {
		const item = view.fileItems![key];
		const direct: object | null = Object.getPrototypeOf(item);
		if (direct === null || visited.has(direct)) {
			continue;
		}
		let proto: object | null = direct;
		while (proto && proto !== Object.prototype) {
			visited.add(proto);
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
		const activate = (): void => {
			void activateFileExplorerFix(plugin);
		};
		if (plugin.app.workspace.layoutReady) {
			activate();
		} else {
			plugin.app.workspace.onLayoutReady(activate);
		}
	} else {
		deactivateFileExplorerFix();
	}
}

async function activateFileExplorerFix(plugin: UImprovePlugin): Promise<void> {
	// Deferred views (e.g. the mobile drawer explorer) stay unloaded — with
	// empty fileItems — until first revealed. Load them explicitly so
	// binding is deterministic on every platform: no events, no polling.
	const leaves = plugin.app.workspace.getLeavesOfType("file-explorer");
	for (const leaf of leaves) {
		if (leaf.isDeferred) {
			await leaf.loadIfDeferred();
		}
	}
	const views = explorerViews(plugin.app);
	if (!views.some((view) => Object.keys(view.fileItems ?? {}).length > 0)) {
		new Notice(
			"[ UImprove file explorer fix ] \nNo populated file explorer view found",
			20_000,
		).messageEl.addClass("mod-warning");
		return;
	}
	for (const view of views) {
		bindExplorerView(view);
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
