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
	headingSeparatorState,
	injectHeadingSeparatorStyles,
	removeHeadingSeparatorStyles,
} from "./headingSeparators";
import {
	collapsedSectionsPlugin,
	collapsedSectionsPostProcessor,
	collapsedSectionsState,
	toggleCollapsedSection,
} from "./collapsedSections";
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

		// Heading separators (Live Preview + Reading view)
		this.registerEditorExtension(headingSeparatorPlugin);
		this.registerMarkdownPostProcessor(headingSeparatorPostProcessor);
		this.applyHeadingSeparators();

		// Collapsed sections (auto-fold marked headings on load)
		this.registerEditorExtension(collapsedSectionsPlugin);
		this.registerMarkdownPostProcessor(collapsedSectionsPostProcessor);
		this.applyCollapsedSections();

		this.addCommand({
			id: "toggle-collapsed-section",
			name: "Toggle Collapsed Section",
			editorCallback: (editor) => toggleCollapsedSection(editor),
		});
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

	/** Applies the heading separators toggle: shared state + injected styles. */
	applyHeadingSeparators(): void {
		headingSeparatorState.enabled = this.settings.headingSeparatorEnabled;
		if (headingSeparatorState.enabled) {
			injectHeadingSeparatorStyles();
		} else {
			removeHeadingSeparatorStyles();
		}
	}

	/** Applies the collapsed sections toggle: shared state. */
	applyCollapsedSections(): void {
		collapsedSectionsState.enabled = this.settings.collapsedSectionsEnabled;
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
