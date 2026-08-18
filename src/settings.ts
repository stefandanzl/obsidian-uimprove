import { App, PluginSettingTab, Setting } from "obsidian";
import type UImprovePlugin from "./main";
import type { FileExplorerStyle } from "./fileExplorerStyles";

export interface UImproveSettings {
	/** Rounded continuous highlights (==...== start/middle/end classes). */
	highlightFixEnabled: boolean;
	/** Strips Obsidian's inline indent compensation from file explorer rows. */
	fileExplorerFixEnabled: boolean;
	/** File & folder styles, configured via the explorer context menu. */
	fileExplorerStylesEnabled: boolean;
	/** vault path -> style of that file/folder (non-recursive). */
	fileExplorerStyles: Record<string, FileExplorerStyle>;
	/** Headings with only dashes (# ---) render as separator lines. */
	headingSeparatorEnabled: boolean;
}

export const DEFAULT_SETTINGS: UImproveSettings = {
	highlightFixEnabled: true,
	fileExplorerFixEnabled: true,
	fileExplorerStylesEnabled: true,
	fileExplorerStyles: {},
	headingSeparatorEnabled: true,
};

export default class UImproveSettingTab extends PluginSettingTab {
	plugin: UImprovePlugin;

	constructor(app: App, plugin: UImprovePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Highlight continuity fix")
			.setDesc(
				"Rounds the outer ends of highlights interrupted by inline formatting " +
					"(==a **b** c==). Injects its CSS only while enabled.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.highlightFixEnabled)
					.onChange(async (value) => {
						this.plugin.settings.highlightFixEnabled = value;
						await this.plugin.saveSettings();
						this.plugin.applyHighlightFix();
					}),
			);

		new Setting(containerEl)
			.setName("File explorer indent fix")
			.setDesc(
				"Removes the inline margin/padding compensation from folder and file rows, " +
					"handing indentation control back to CSS.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.fileExplorerFixEnabled)
					.onChange(async (value) => {
						this.plugin.settings.fileExplorerFixEnabled = value;
						await this.plugin.saveSettings();
						this.plugin.applyFileExplorerFix();
					}),
			);

		new Setting(containerEl)
			.setName("File & folder styles")
			.setDesc(
				"Border, background and text styling for files and folders in the file explorer. " +
					"Configure per item via its context menu ('… style…').",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.fileExplorerStylesEnabled)
					.onChange(async (value) => {
						this.plugin.settings.fileExplorerStylesEnabled = value;
						await this.plugin.saveSettings();
						this.plugin.applyFileExplorerStyles();
					}),
			);

		new Setting(containerEl)
			.setName("Heading separators")
			.setDesc(
				"Headings whose text is only dashes (# ---, ## -----, …) render as " +
					"separator lines in their heading level's color.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.headingSeparatorEnabled)
					.onChange(async (value) => {
						this.plugin.settings.headingSeparatorEnabled = value;
						await this.plugin.saveSettings();
						this.plugin.applyHeadingSeparators();
					}),
			);
	}
}
