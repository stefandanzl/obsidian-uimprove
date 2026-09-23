import { Plugin } from "obsidian";
import {
	highlightFixPlugin,
	highlightFixState,
	highlightPostProcessor,
	injectHighlightFixStyles,
	removeHighlightFixStyles,
	showHighlightColorMenu,
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
import { registerConsoleCommands } from "./consoleUtils";
import { applyCanvasFeatures, registerCanvasFeatures } from "./canvasFeatures";
import {
	applyTableBreakout,
	removeTableBreakoutTraces,
	tableBreakoutPostProcessor,
} from "./tableBreakout";
import { applyTableStretch, removeTableStretchTraces } from "./tableStretch";

export default class UImprovePlugin extends Plugin {
	declare settings: UImproveSettings;

	private loadedFeatures: {
		collapsedSections: boolean;
		highlightFix: boolean;
	};

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.addSettingTab(new UImproveSettingTab(this.app, this));
		this.loadedFeatures = {
			collapsedSections: false,
			highlightFix: false,
		};

		// Highlight start/end classes (Live Preview + Reading view)
		this.registerEditorExtension(highlightFixPlugin);
		this.registerMarkdownPostProcessor(highlightPostProcessor);
		this.applyHighlightFix();

		// File explorer indent fix
		this.applyFileExplorerFix();

		// File & folder styles (context menu + injected CSS)
		registerFileExplorerStyleMenu(this);
		this.applyFileExplorerStyles();

		// Heading separators (Live Preview + Reading view)
		this.registerEditorExtension(headingSeparatorPlugin);
		this.registerMarkdownPostProcessor(headingSeparatorPostProcessor);
		this.applyHeadingSeparators();

		// Collapsed sections (auto-fold marked headings on load)
		this.registerEditorExtension(collapsedSectionsPlugin);
		this.registerMarkdownPostProcessor(collapsedSectionsPostProcessor);
		this.applyCollapsedSections();

		// Canvas UI features (add-group button, …)
		registerCanvasFeatures(this);
		this.applyCanvasFeatures();

		// Table breakout (tables escape the readable line width)
		this.registerMarkdownPostProcessor(tableBreakoutPostProcessor);
		this.applyTableBreakout();

		// Stretch tables (stretch up to / bounded by the available width)
		this.applyTableStretch();

		registerConsoleCommands(this);
	}

	onunload() {
		deactivateFileExplorerFix();
		// Manually injected <style> elements outlive the plugin otherwise.
		removeHighlightFixStyles();
		removeFileExplorerStyles();
		removeHeadingSeparatorStyles();
		removeTableBreakoutTraces();
		removeTableStretchTraces();
	}

	/** Applies the highlight fix toggle: shared state + injected styles. */
	applyHighlightFix(): void {
		highlightFixState.enabled = this.settings.highlightFixEnabled;
		if (highlightFixState.enabled) {
			injectHighlightFixStyles();

			if (!this.loadedFeatures.highlightFix) {
				this.addCommand({
					id: "show-highlight-color-menu",
					name: "Show highlight color menu",
					icon: "highlighter",
					editorCallback: (editor) => showHighlightColorMenu(this.app, editor),
				});
				this.loadedFeatures.highlightFix = true;
			}
		} else {
			removeHighlightFixStyles();
			if (this.loadedFeatures.highlightFix) {
				this.removeCommand("show-highlight-color-menu");
				this.loadedFeatures.highlightFix = false;
			}
		}
	}

	/** Applies the file explorer fix toggle: shared state + patches. */
	applyFileExplorerFix(): void {
		applyFileExplorerFix(this);
	}

	/** Applies the canvas features toggle: inject or remove UI elements. */
	applyCanvasFeatures(): void {
		applyCanvasFeatures(this);
	}

	/** Applies the table breakout toggle: body class + styles. */
	applyTableBreakout(): void {
		applyTableBreakout(this);
	}

	/** Applies the stretch tables toggle: body class + styles. */
	applyTableStretch(): void {
		applyTableStretch(this);
	}

	/** Applies the folder styles toggle: injected styles. */
	applyFileExplorerStyles(): void {
		applyFileExplorerStyles(this);
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

		if (this.settings.collapsedSectionsEnabled && !this.loadedFeatures.collapsedSections) {
			this.addCommand({
				id: "toggle-collapsed-section",
				name: "Toggle Collapsed Section",
				editorCallback: (editor) => toggleCollapsedSection(editor),
			});
			this.loadedFeatures.collapsedSections = true;
		} else if (!this.settings.collapsedSectionsEnabled && this.loadedFeatures.collapsedSections) {
			this.removeCommand("toggle-collapsed-section");
			this.loadedFeatures.collapsedSections = false;
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
