import { type App, Menu, Modal, Setting, TFile, TFolder } from "obsidian";
import type UImprovePlugin from "./main";

/**
 * File & folder styles (file explorer).
 *
 * Styles an item itself — never its contents recursively, except the
 * explicit "content text color" of a folder. Pure CSS driven by settings:
 * one tiny "anchor" rule per styled item that only sets CSS custom
 * properties, plus shared consumer rules (written once) that read those
 * properties with inert fallbacks. Items without anchor rules are
 * completely unaffected. Each styling target has its own color field —
 * an empty color disables that target.
 *
 * Anchoring uses :has() on the title's data-path — CSS matches whenever the
 * elements exist, so the virtual renderer's detach/reattach needs no
 * handling: no patches, observers or sweeps involved. Style injection at
 * startup is O(styled items), never O(vault).
 *
 * TODO: extended feature — recursive styling of a folder's contained
 * folders/files beyond text, e.g. depth-shaded backgrounds via nested
 * selectors and color-mix() on inherited custom properties. NOT yet.
 */

const STYLE_ID = "uimprove-file-explorer-styles";

/**
 * Per-target colors of one styled item. Empty string = target not styled.
 * Folder-only targets are ignored for files.
 */
export interface FileExplorerStyle {
	type: "file" | "folder";
	/** Border around the item (folder: whole container, file: the row). */
	borderColor: string;
	/** Folder: background behind container and contents. File: row background. */
	backgroundColor: string;
	/** Folder only: background of the folder title row. */
	headerBackgroundColor: string;
	/** Text color of the item's own title. */
	titleTextColor: string;
	/** Folder only: text color of everything inside the folder. */
	contentTextColor: string;
}

function defaultStyle(type: "file" | "folder"): FileExplorerStyle {
	return {
		type,
		borderColor: "",
		backgroundColor: "",
		headerBackgroundColor: "",
		titleTextColor: "",
		contentTextColor: "",
	};
}

/** Safe read of a persisted color field — garbage/missing data yields "". */
function col(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function isStyleActive(style: Partial<FileExplorerStyle>): boolean {
	return (
		col(style.borderColor).length > 0 ||
		col(style.backgroundColor).length > 0 ||
		col(style.headerBackgroundColor).length > 0 ||
		col(style.titleTextColor).length > 0 ||
		col(style.contentTextColor).length > 0
	);
}

/** Escapes a path for use inside a double-quoted CSS attribute selector. */
function cssQuote(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Shared consumer rules — constant, emitted once. Every property falls back
 * to an inert value, so unstyled items are untouched.
 *
 * Title text falls through to the content text color: that variable is set
 * on the folder's CHILDREN container, so it reaches everything inside
 * without coloring the folder's own header.
 */
const SHARED_CSS = `
.tree-item.nav-folder,
.tree-item.nav-file {
	border: var(--uimf-border-w, 0px) solid var(--uimf-border-c, transparent);
	border-radius: var(--uimf-radius, 6px);
	background: var(--uimf-bg, transparent);
}
.tree-item.nav-folder > .tree-item-self.nav-folder-title,
.tree-item.nav-file > .tree-item-self.nav-file-title {
	background: var(--uimf-hbg, transparent);
	color: var(--uimf-title-text, var(--uimf-content-text, inherit));
}
/* Fence: custom properties inherit down the DOM — reset them on nested
items so styling never recurses into subfolders/files. Anchor rules are
more specific, so a nested STYLED item still applies its own values.
--uimf-content-text is deliberately NOT fenced (that is its purpose). */
.tree-item .tree-item {
	--uimf-border-w: 0px;
	--uimf-border-c: transparent;
	--uimf-bg: transparent;
	--uimf-hbg: transparent;
	/* "initial", not "inherit": "inherit" on a custom property re-inherits
	the parent's value (defeating the fence); "initial" is guaranteed-invalid,
	so var() falls through to its fallback (the content text color, then
	the normal inherited color). */
	--uimf-title-text: initial;
}
`;

/** The anchor selector of an item, by type. */
function anchorSelector(path: string, style: Partial<FileExplorerStyle>): string {
	const titleClass =
		style.type === "file" ? "nav-file-title" : "nav-folder-title";
	const itemClass = style.type === "file" ? "nav-file" : "nav-folder";
	return `.tree-item.${itemClass}:has(> .tree-item-self.${titleClass}[data-path="${cssQuote(path)}"])`;
}

/** Anchor rules per styled item: they set variables, nothing else. */
function anchorRules(path: string, style: Partial<FileExplorerStyle>): string[] {
	const borderColor = col(style.borderColor);
	const backgroundColor = col(style.backgroundColor);
	const headerBackgroundColor = col(style.headerBackgroundColor);
	const titleTextColor = col(style.titleTextColor);
	const contentTextColor = col(style.contentTextColor);

	const lines: string[] = [];
	if (borderColor) {
		lines.push(`\t--uimf-border-w: 1px;`, `\t--uimf-border-c: ${borderColor};`);
		lines.push(`\tpadding: 2px;`, `\tmargin: 2px 0;`);
	}
	if (backgroundColor) {
		lines.push(`\t--uimf-bg: ${backgroundColor};`);
	}
	if (headerBackgroundColor) {
		lines.push(`\t--uimf-hbg: ${headerBackgroundColor};`);
	}
	if (titleTextColor) {
		lines.push(`\t--uimf-title-text: ${titleTextColor};`);
	}

	const rules: string[] = [];
	if (lines.length > 0) {
		rules.push(`${anchorSelector(path, style)} {\n${lines.join("\n")}\n}`);
	}
	// Content text goes on the children container: it inherits into all
	// contained items but not into the folder's own header row.
	if (contentTextColor) {
		rules.push(
			`${anchorSelector(path, style)} > .tree-item-children {\n\t--uimf-content-text: ${contentTextColor};\n}`,
		);
		// Content text hover: contained rows darken on hover. The var chain
		// respects a nested item's own title color if it has one configured
		// (its anchor beats the fence), the content color otherwise.
		rules.push(
			`${anchorSelector(path, style)} > .tree-item-children .tree-item-self:hover {\n\tcolor: color-mix(in srgb, var(--uimf-title-text, var(--uimf-content-text)) 80%, black);\n}`,
		);
	}

	// Hover: derived from the configured colors via color-mix toward black,
	// and only emitted for targets that have a color — unstyled items keep
	// Obsidian's native hover untouched.
	const hoverLines: string[] = [];
	if (headerBackgroundColor) {
		hoverLines.push(`\tbackground: color-mix(in srgb, ${headerBackgroundColor} 85%, black);`);
	} else if (style.type === "file" && backgroundColor) {
		hoverLines.push(`\tbackground: color-mix(in srgb, ${backgroundColor} 85%, black);`);
	}
	if (titleTextColor) {
		hoverLines.push(`\tcolor: color-mix(in srgb, ${titleTextColor} 80%, black);`);
	}
	if (hoverLines.length > 0) {
		const titleClass =
			style.type === "file" ? "nav-file-title" : "nav-folder-title";
		rules.push(
			`${anchorSelector(path, style)} > .tree-item-self.${titleClass}:hover {\n${hoverLines.join("\n")}\n}`,
		);
	}
	return rules;
}

function generateFileExplorerStyleCss(styles: Record<string, FileExplorerStyle>): string {
	const anchors = Object.entries(styles)
		.filter(([path, style]) => path && isStyleActive(style))
		.flatMap(([path, style]) => anchorRules(path, style));
	if (anchors.length === 0) {
		return "";
	}
	return SHARED_CSS + "\n" + anchors.join("\n");
}

/** (Re)generates the injected style element from settings; removes if empty. */
export function applyFileExplorerStyles(plugin: UImprovePlugin): void {
	const existing = document.getElementById(STYLE_ID);
	const enabled =
		plugin.settings.fileExplorerStylesEnabled &&
		Object.keys(plugin.settings.fileExplorerStyles).length > 0;
	if (!enabled) {
		existing?.remove();
		return;
	}
	const css = generateFileExplorerStyleCss(plugin.settings.fileExplorerStyles);
	if (!css) {
		existing?.remove();
		return;
	}
	if (existing) {
		existing.textContent = css;
	} else {
		const el = document.createElement("style");
		el.id = STYLE_ID;
		el.textContent = css;
		document.head.appendChild(el);
	}
}

export function removeFileExplorerStyles(): void {
	document.getElementById(STYLE_ID)?.remove();
}

/** Adds "… style…" to file and folder context menus in the explorer. */
export function registerFileExplorerStyleMenu(plugin: UImprovePlugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on("file-menu", (menu: Menu, file: unknown) => {
			if (!(file instanceof TFile) && !(file instanceof TFolder)) {
				return;
			}
			menu.addItem((item) =>
				item
					.setTitle(file instanceof TFolder ? "Folder style…" : "File style…")
					.setIcon("palette")
					.onClick(() => new FileExplorerStyleModal(plugin.app, plugin, file).open()),
			);
		}),
	);
}

class FileExplorerStyleModal extends Modal {
	private original: FileExplorerStyle;
	private value: FileExplorerStyle;

	constructor(
		app: App,
		private plugin: UImprovePlugin,
		private target: TFile | TFolder,
	) {
		super(app);
		this.original = {
			...defaultStyle(target instanceof TFolder ? "folder" : "file"),
			...plugin.settings.fileExplorerStyles[target.path],
		};
		this.value = { ...this.original };
	}

	onOpen(): void {
		const isFolder = this.target instanceof TFolder;
		this.titleEl.setText(isFolder ? "Folder style" : "File style");
		this.contentEl.createEl("p", {
			text: this.target.path,
			cls: "uimprove-modal-path",
		});

		const colorField = (
			name: string,
			desc: string,
			key: keyof FileExplorerStyle,
		): void => {
			new Setting(this.contentEl)
				.setName(name)
				.setDesc(desc)
				.addText((text) =>
					text
						.setPlaceholder("azure, #ff8800, rgba(…), var(--color-accent)")
						.setValue(this.value[key] as string)
						.onChange((v) => {
							(this.value[key] as string) = v;
							this.preview();
						}),
				);
		};

		colorField(
			isFolder ? "Frame border color" : "Border color",
			isFolder
				? "Border around the whole folder container, incl. contents while unfolded."
				: "Border around the file row.",
			"borderColor",
		);
		colorField(
			isFolder ? "Container background" : "Row background",
			isFolder
				? "Behind the whole folder container and its contents. Alpha colors recommended."
				: "Background of the file row. Alpha colors recommended.",
			"backgroundColor",
		);
		if (isFolder) {
			colorField(
				"Header background",
				"Background of the folder title row only.",
				"headerBackgroundColor",
			);
		}
		colorField(
			isFolder ? "Header text color" : "Text color",
			isFolder
				? "Text color of the folder's own title row."
				: "Text color of the file name.",
			"titleTextColor",
		);
		if (isFolder) {
			colorField(
				"Content text color",
				"Text color of everything inside the folder (files and subfolders).",
				"contentTextColor",
			);
		}

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText("Remove styling").onClick(async () => {
					this.value = defaultStyle(this.value.type);
					this.original = defaultStyle(this.value.type);
					delete this.plugin.settings.fileExplorerStyles[this.target.path];
					await this.plugin.saveSettings();
					applyFileExplorerStyles(this.plugin);
					this.close();
				}),
			)
			.addButton((button) =>
				button
					.setButtonText("Save")
					.setCta()
					.onClick(async () => {
						this.original = { ...this.value };
						await this.persist();
						this.close();
					}),
			);
	}

	onClose(): void {
		// Cancelled edits roll back to the last saved state.
		if (JSON.stringify(this.value) !== JSON.stringify(this.original)) {
			this.value = { ...this.original };
			this.persist();
		}
	}

	/** Live preview: applies without saving; Save/Close decides persistence. */
	private preview(): void {
		this.writeToSettings(this.value);
		applyFileExplorerStyles(this.plugin);
	}

	private async persist(): Promise<void> {
		this.writeToSettings(this.value);
		await this.plugin.saveSettings();
		applyFileExplorerStyles(this.plugin);
	}

	private writeToSettings(style: FileExplorerStyle): void {
		if (isStyleActive(style)) {
			this.plugin.settings.fileExplorerStyles[this.target.path] = style;
		} else {
			delete this.plugin.settings.fileExplorerStyles[this.target.path];
		}
	}
}
