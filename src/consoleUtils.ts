import UImprovePlugin from "./main";

/**
 * TS SYNTAX RULE: 'var' is REQUIRED for ambient declarations inside 'declare global' to merge properties
 */
declare global {
	var myGlobalConfig: {
		apiUrl: string;
		debugMode: boolean;
	};
	var custom: {
		inspectAllFiltered(obj: any): Function;
	};

	function inspectAllFiltered(obj: any): unknown[];
	function myGlobalHelper(msg: string): void;
}

/**
 *
 *
 * @param plugin
 */
export async function registerConsoleCommands(plugin: UImprovePlugin) {
	/**
	 * Useful for discovering hidden properties in objects. Only works in first level.
	 * @param obj Any object that's available in browser Devtools console environment.
	 * @returns Array of all contained elements. Only first level even if nested.
	 */
	function inspectAllFiltered(obj: any): unknown[] {
		const jsDefaults = new Set([
			"__defineGetter__",
			"__defineSetter__",
			"__lookupGetter__",
			"__lookupSetter__",
			"__proto__",
			"constructor",
			"hasOwnProperty",
			"isPrototypeOf",
			"propertyIsEnumerable",
			"toLocaleString",
			"toString",
			"valueOf",
		]);

		let props = new Set();
		let current = obj;

		while (current && current !== Object.prototype) {
			Object.getOwnPropertyNames(current).forEach((p) => {
				if (!jsDefaults.has(p)) props.add(p);
			});
			current = Object.getPrototypeOf(current);
		}

		return [...props].sort();
	}

	globalThis.inspectAllFiltered = inspectAllFiltered;

	// Clean up after disabling plugin
	plugin.register(() => {
		delete (globalThis as any).inspectAllFiltered;
	});
}
