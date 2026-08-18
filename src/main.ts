import { Plugin } from "obsidian";
import {
	highlightFixPlugin,
	highlightFixState,
	highlightPostProcessor,
	injectHighlightFixStyles,
	removeHighlightFixStyles,
} from "./highlightFixPlugin";
import {
	applyFileExplorerFix,
	deactivateFileExplorerFix,
} from "./fileExplorerFix";
import UImproveSettingTab from "./settings";
import { DEFAULT_SETTINGS, type UImproveSettings } from "./settings";

export default class UImprovePlugin extends Plugin {
	declare settings: UImproveSettings;

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.addSettingTab(new UImproveSettingTab(this.app, this));

		// Highlight start/end classes (Live Preview + Reading view)
		this.registerEditorExtension(highlightFixPlugin);
		this.registerMarkdownPostProcessor(highlightPostProcessor);
		this.applyHighlightFix();

		// File explorer indent fix
		this.applyFileExplorerFix();
	}

	onunload() {
		deactivateFileExplorerFix();
	}

	/** Applies the highlight fix toggle: shared state + injected styles. */
	applyHighlightFix(): void {
		highlightFixState.enabled = this.settings.highlightFixEnabled;
		if (highlightFixState.enabled) {
			injectHighlightFixStyles();
		} else {
			removeHighlightFixStyles();
		}
	}

	/** Applies the file explorer fix toggle: shared state + patches. */
	applyFileExplorerFix(): void {
		applyFileExplorerFix(this);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
