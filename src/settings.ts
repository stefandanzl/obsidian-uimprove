import { App, PluginSettingTab, Setting } from "obsidian";
import type UImprovePlugin from "./main";

export interface UImproveSettings {
	/** Rounded continuous highlights (==...== start/middle/end classes). */
	highlightFixEnabled: boolean;
	/** Strips Obsidian's inline indent compensation from file explorer rows. */
	fileExplorerFixEnabled: boolean;
}

export const DEFAULT_SETTINGS: UImproveSettings = {
	highlightFixEnabled: true,
	fileExplorerFixEnabled: true,
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
	}
}
