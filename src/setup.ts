import { Plugin } from "obsidian";
import type MyPlugin from "./main";

export function registerCommands(plugin: MyPlugin) {
	// Add your commands here
	plugin.addCommand({
		id: "sample-command",
		name: "Sample Command",
		callback: () => {
			// Command implementation
			console.log("Sample command executed");
		},
	});
}
