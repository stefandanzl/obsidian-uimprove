import { type App, setIcon } from "obsidian";
import type UImprovePlugin from "./main";

/**
 * Canvas UI features.
 *
 * A collection of canvas enhancements, all DOM injections into the canvas
 * view — no monkey-patching. Currently:
 *
 * - "Add group" button in the card menu (next to add-card / add-note /
 *   add-media): click drops a group in the center, drag places it via the
 *   native ghost-drag mechanic (canvas.dragTempNode) — same feel as the
 *   built-in add-card button.
 *
 * All features share one settings toggle and register/unregister together.
 */

/** Live toggle state, consulted by the injection sweeps. */
export const canvasFeaturesState = { enabled: true };

/** Default group size — Obsidian's config has no group default; 400×400. */
const GROUP_SIZE = { width: 400, height: 400 };

type Pos = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

/** Canvas node bounding box — min/max form, as getBBox() returns it. */
type BBox = { minX: number; minY: number; maxX: number; maxY: number };

type CanvasNodeLike = {
	getBBox: () => BBox;
};

type CanvasLike = {
	cardMenuEl?: HTMLElement;
	posCenter: () => Pos;
	deselectAll: () => void;
	selection?: Set<CanvasNodeLike>;
	createGroupNode: (options: {
		pos: Pos | Rect;
		size?: { width: number; height: number } | Rect;
		position?: string;
	}) => unknown;
	dragTempNode: (
		event: PointerEvent,
		size: { width: number; height: number },
		onDrop: (pos: Pos) => void,
	) => void;
};

/**
 * Bounding box of the current selection, expanded by padding — the same
 * computation the native "Create group" context menu entry performs
 * (union of the selected nodes' bBoxes + 20px). Null when nothing (usable)
 * is selected.
 */
function selectionBBox(canvas: CanvasLike, padding: number): Rect | null {
	const boxes: BBox[] = [];
	for (const node of canvas.selection ?? []) {
		const box = node.getBBox();
		if (box.maxX > box.minX || box.maxY > box.minY) {
			boxes.push(box);
		}
	}
	if (boxes.length === 0) {
		return null;
	}
	const minX = Math.min(...boxes.map((b) => b.minX));
	const minY = Math.min(...boxes.map((b) => b.minY));
	const maxX = Math.max(...boxes.map((b) => b.maxX));
	const maxY = Math.max(...boxes.map((b) => b.maxY));
	return {
		x: minX - padding,
		y: minY - padding,
		width: maxX - minX + 2 * padding,
		height: maxY - minY + 2 * padding,
	};
}

function canvasViews(app: App): CanvasLike[] {
	return app.workspace
		.getLeavesOfType("canvas")
		.map((leaf) => (leaf.view as unknown as { canvas?: CanvasLike }).canvas)
		.filter((c): c is CanvasLike => !!c && !!c.cardMenuEl);
}

/** Menus that already carry our button (re-inject protection). */
const injectedMenus = new WeakSet<HTMLElement>();
/** Injected elements, so disabling the feature can remove them. */
let injectedElements: HTMLElement[] = [];

/** Feature: "Add group" button in the card menu. */
function injectGroupButton(canvas: CanvasLike): void {
	const menu = canvas.cardMenuEl!;
	if (injectedMenus.has(menu)) {
		return;
	}
	injectedMenus.add(menu);

	const button = menu.createDiv({
		cls: "canvas-card-menu-button mod-draggable",
		attr: {
			"aria-label": "Drag to add group",
			"data-tooltip-position": "top",
		},
	});
	setIcon(button, "lucide-group");

	button.addEventListener("click", () => {
		// With a selection: wrap it (native "Create group" behavior —
		// union bbox + 20px padding). Without: drop a default group in
		// the viewport center.
		const rect = selectionBBox(canvas, 20);
		if (rect) {
			canvas.createGroupNode({ pos: rect, size: rect });
		} else {
			canvas.createGroupNode({ pos: canvas.posCenter(), position: "center" });
		}
	});
	button.addEventListener("pointerdown", (event) => {
		canvas.dragTempNode(event, GROUP_SIZE, (pos) => {
			canvas.deselectAll();
			canvas.createGroupNode({ pos, size: GROUP_SIZE });
		});
	});

	injectedElements.push(button);
}

/** Runs every feature's injection over all open canvas views. */
function injectIntoAll(app: App): void {
	for (const canvas of canvasViews(app)) {
		injectGroupButton(canvas);
	}
}

/** Registers the sweep hooks; call once at plugin load. */
export function registerCanvasFeatures(plugin: UImprovePlugin): void {
	const sweep = (): void => {
		if (!canvasFeaturesState.enabled) {
			return;
		}
		injectIntoAll(plugin.app);
	};
	plugin.registerEvent(plugin.app.workspace.on("layout-change", sweep));
	plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", sweep));
	if (plugin.app.workspace.layoutReady) {
		sweep();
	} else {
		plugin.app.workspace.onLayoutReady(sweep);
	}
}

/** Applies the toggle: injects while enabled, removes elements when disabled. */
export function applyCanvasFeatures(plugin: UImprovePlugin): void {
	canvasFeaturesState.enabled = plugin.settings.canvasFeaturesEnabled;
	if (canvasFeaturesState.enabled) {
		injectIntoAll(plugin.app);
	} else {
		for (const el of injectedElements) {
			el.detach();
		}
		injectedElements = [];
	}
}
