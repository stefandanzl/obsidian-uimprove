import { type App, Menu, Modal, Setting, TFile, TFolder } from "obsidian";
import type UImprovePlugin from "./main";

/**
 * File & folder styles (file explorer).
 *
 * Styles an item itself — never its contents recursively. Pure CSS driven
 * by settings: one tiny "anchor" rule per styled item that only sets CSS
 * custom properties on the item's container, plus shared consumer rules
 * (written once) that read those properties with inert fallbacks. Items
 * without anchor rules are completely unaffected.
 *
 * Anchoring uses :has() on the title's data-path — CSS matches whenever the
 * elements exist, so the virtual renderer's detach/reattach needs no
 * handling: no patches, observers or sweeps involved. Style injection at
 * startup is O(styled items), never O(vault).
 *
 * TODO: extended feature — recursive styling of a folder's contained
 * folders/files, e.g. depth-shaded backgrounds via nested selectors and
 * color-mix() on the inherited custom properties. NOT implemented yet.
 */

const STYLE_ID = "uimprove-file-explorer-style-styles";

/**
 * Which parts of an item a single configured color is applied to.
 * For files, `headerBackground` means the row background; container
 * background and frame wrap the (childless) file row.
 */
export interface FileExplorerStyle {
	type: "file" | "folder";
	color: string;
	frame: boolean;
	containerBackground: boolean;
	headerBackground: boolean;
	text: boolean;
}

function defaultStyle(type: "file" | "folder"): FileExplorerStyle {
	return {
		type,
		color: "",
		frame: true,
		containerBackground: false,
		headerBackground: false,
		text: false,
	};
}

function isStyleActive(style: FileExplorerStyle): boolean {
	return (
		style.color.trim().length > 0 &&
		(style.frame || style.containerBackground || style.headerBackground || style.text)
	);
}

/** Escapes a path for use inside a double-quoted CSS attribute selector. */
function cssQuote(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Shared consumer rules — constant, emitted once. Every property falls back
 * to an inert value (transparent / 0 / inherit), so unstyled items are
 * untouched; the custom properties inherit from the anchor rule.
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
	color: var(--uimf-text, inherit);
}
`;

/** One anchor rule per styled item: sets variables, nothing else. */
function anchorRule(path: string, style: FileExplorerStyle): string {
	const lines: string[] = [];
	if (style.frame) {
		lines.push(`\t--uimf-border-w: 1px;`, `\t--uimf-border-c: ${style.color};`);
		lines.push(`\tpadding: 2px;`, `\tmargin: 2px 0;`);
	}
	if (style.containerBackground) {
		lines.push(`\t--uimf-bg: ${style.color};`);
	}
	if (style.headerBackground) {
		lines.push(`\t--uimf-hbg: ${style.color};`);
	}
	if (style.text) {
		lines.push(`\t--uimf-text: ${style.color};`);
	}
	if (lines.length === 0) {
		return "";
	}
	const titleClass =
		style.type === "file" ? "nav-file-title" : "nav-folder-title";
	const itemClass = style.type === "file" ? "nav-file" : "nav-folder";
	return `.tree-item.${itemClass}:has(> .tree-item-self.${titleClass}[data-path="${cssQuote(path)}"]) {\n${lines.join("\n")}\n}`;
}

function generateFileExplorerStyleCss(styles: Record<string, FileExplorerStyle>): string {
	const anchors = Object.entries(styles)
		.filter(([path, style]) => path && isStyleActive(style))
		.map(([path, style]) => anchorRule(path, style));
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

/** Adds "Style…" to file and folder context menus in the explorer. */
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

		new Setting(this.contentEl)
			.setName("Color")
			.setDesc(
				"Any CSS color: azure, #ff0000, rgba(…), var(--color-accent)… " +
					"Use alpha colors (rgba/hex8) for backgrounds.",
			)
			.addText((text) =>
				text
					.setPlaceholder("azure")
					.setValue(this.value.color)
					.onChange((v) => {
						this.value.color = v;
						this.preview();
					}),
			);

		const target = (name: string, desc: string, key: keyof FileExplorerStyle): void => {
			new Setting(this.contentEl)
				.setName(name)
				.setDesc(desc)
				.addToggle((toggle) =>
					toggle
						.setValue(Boolean(this.value[key]))
						.onChange((v) => {
							(this.value[key] as boolean) = v;
							this.preview();
						}),
				);
		};
		target(
			isFolder ? "Frame border" : "Border",
			isFolder
				? "Border around the whole folder container, incl. contents while unfolded."
				: "Border around the file row.",
			"frame",
		);
		if (isFolder) {
			target(
				"Container background",
				"Background behind the whole folder container and its contents.",
				"containerBackground",
			);
			target("Header background", "Background of the folder title row only.", "headerBackground");
		} else {
			target("Row background", "Background of the file row.", "headerBackground");
		}
		target("Text color", "Text color of the title.", "text");

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
