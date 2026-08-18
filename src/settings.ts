import { App, PluginSettingTab } from "obsidian";
import type UImprovePlugin from "./main";

export interface UImproveSettings {
	// Feature toggles will be added once the features are stable.
}

export const DEFAULT_SETTINGS: UImproveSettings = {};

export default class UImproveSettingTab extends PluginSettingTab {
	plugin: UImprovePlugin;

	constructor(app: App, plugin: UImprovePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
	}
}
