import { App, PluginSettingTab, Setting } from "obsidian";
import type UImprovePlugin from "./main";

export interface UImproveSettings {
	/** Rounded continuous highlights (==...== start/middle/end classes). */
	highlightFixEnabled: boolean;
}

export const DEFAULT_SETTINGS: UImproveSettings = {
	highlightFixEnabled: true,
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
	}
}
