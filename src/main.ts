import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS } from "./settings";
import { MySettings } from "./settings";
import MyPluginSettingTab from "./settings";

export default class MyPlugin extends Plugin {
	declare settings: MySettings;

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		// Add settings tab
		this.addSettingTab(new MyPluginSettingTab(this.app, this));
	}
}
