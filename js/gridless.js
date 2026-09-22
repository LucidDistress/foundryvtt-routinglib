// Isolate optional generated assets: a missing WASM build must not prevent
// the JavaScript gridded pathfinder from loading.
let bindings;
let initialization;
let failure;

export default function initialize() {
	return initialization ??= (async () => {
		try {
			const module = await import("../wasm/gridless_pathfinding.js");
			await module.default();
			bindings = module;
		} catch (error) {
			failure = error;
			throw error;
		}
	})();
}

function call(name, args) {
	if (!bindings) {
		throw new Error("RoutingLib gridless engine is unavailable. Install a complete release with its WASM assets and reload Foundry.", {cause: failure});
	}
	return bindings[name](...args);
}

export const initializeGraph = (...args) => call("initializeGraph", args);
export const freeGraph = (...args) => call("freeGraph", args);
export const initializePathfinder = (...args) => call("initializePathfinder", args);
export const resetPathfinder = (...args) => call("resetPathfinder", args);
export const dropPathfinder = (...args) => call("dropPathfinder", args);
export const step = (...args) => call("step", args);
