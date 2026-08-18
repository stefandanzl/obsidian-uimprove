import { Plugin } from "obsidian";
import {
	highlightFixPlugin,
	highlightFixState,
	highlightPostProcessor,
	injectHighlightFixStyles,
	removeHighlightFixStyles,
} from "./highlightFixPlugin";
import { applyFileExplorerFix, deactivateFileExplorerFix } from "./fileExplorerFix";
import {
	applyFileExplorerStyles,
	registerFileExplorerStyleMenu,
	removeFileExplorerStyles,
} from "./fileExplorerStyles";
import {
	headingSeparatorPlugin,
	headingSeparatorPostProcessor,
	injectHeadingSeparatorStyles,
	removeHeadingSeparatorStyles,
} from "./headingSeparators";
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

		// File & folder styles (context menu + injected CSS)
		this.registerFileExplorerStyleMenu();
		this.applyFileExplorerStyles();

		this.applyHeadingSeparators();
	}

	onunload() {
		deactivateFileExplorerFix();
		// Manually injected <style> elements outlive the plugin otherwise.
		removeHighlightFixStyles();
		removeFileExplorerStyles();
		removeHeadingSeparatorStyles();
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

	/** Applies the folder styles toggle: injected styles. */
	applyFileExplorerStyles(): void {
		applyFileExplorerStyles(this);
	}

	/** Registers the explorer context-menu entry for folder styling. */
	registerFileExplorerStyleMenu(): void {
		registerFileExplorerStyleMenu(this);
	}

	applyHeadingSeparators(): void {
		injectHeadingSeparatorStyles();
		// 2. Editor Extension für Live Preview einhängen
		this.registerEditorExtension([headingSeparatorPlugin]);

		// 3. Markdown Post Processor für Reading View einhängen
		this.registerMarkdownPostProcessor(headingSeparatorPostProcessor);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
