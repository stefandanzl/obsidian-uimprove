import { Plugin } from "obsidian";
import { highlightFixPlugin, highlightPostProcessor } from "./highlightFixPlugin";

export default class UImprovePlugin extends Plugin {
	async onload() {
		// Highlight start/end classes (Live Preview)
		this.registerEditorExtension(highlightFixPlugin);

		// Highlight start/end classes (Reading view)
		this.registerMarkdownPostProcessor(highlightPostProcessor);
	}
}
