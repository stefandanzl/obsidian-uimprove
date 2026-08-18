import { App, PluginSettingTab } from "obsidian";
import MyPlugin from "./main";

export interface MySettings {
	enabled: boolean;
	apiKey: string;
}

export const DEFAULT_SETTINGS: MySettings = {
	enabled: true,
	apiKey: "",
};

export default class MyPluginSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}
}
