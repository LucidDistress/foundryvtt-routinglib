import {initializeBackground, createAsyncPathfinder, cancelJob, invalidateJobs} from "./background.js";
import {cache, GriddedCache, initializeCaches, wipeCaches, disposeCaches} from "./cache.js";
import {GriddedPathfinder, GridlessPathfinder} from "./pathfinder.js";

import initGridlessPathfinding from "../wasm/gridless_pathfinding.js";
import {getAltOrientationFlagForToken, getHexTokenSize, isModuleActive} from "./util.js";

let foundryReady = false;
let wasmReady = false;

function initializePathfinder(from, to, options) {
	if (!canvas?.ready || !cache) throw new Error("RoutingLib requires a ready scene.");
	for (const point of [from, to]) {
		if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
			throw new TypeError("RoutingLib coordinates must be finite numbers.");
		}
	}
	if (options.maxDistance != null && (!(options.maxDistance >= 0) || typeof options.maxDistance !== "number")) {
		throw new RangeError("maxDistance must be a nonnegative number.");
	}
	const token = options.token;

	let elevation = options.elevation;
	let tokenData;

	if (token) {
		tokenData = {width: token.document.width, height: token.document.height};
		if (elevation == null) {
			elevation =
				isModuleActive("wall-height") && token.losHeight != null
					? token.losHeight
					: token.document.elevation;
		}
		if (canvas.grid.isHexagonal) {
			tokenData.size = getHexTokenSize(token);
			tokenData.altOrientation = getAltOrientationFlagForToken(token, tokenData.size);
		}
	} else {
		tokenData = {width: 1, height: 1};
		elevation = elevation ?? 0;
		if (canvas.grid.isHexagonal) {
			tokenData.size = 1;
			tokenData.altOrientation = false;
		}
	}

	tokenData.elevation = elevation;

	const levelIndex = cache.getLevelIndexForElevation(elevation);
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		const tokenSize = Math.max(tokenData.width, tokenData.height);
		// Reacquire the graph after wall changes: resetting the Rust search alone
		// retains its old graph and therefore its old obstacles.
		const getGraph = () => cache.getGraphFor(tokenSize, cache.getLevelIndexForElevation(elevation), elevation);
		return new GridlessPathfinder(getGraph(), from, to, options, getGraph);
	} else {
		const sizeIndex = GriddedCache.getSnapPointIndexForTokenData(tokenData);
		return new GriddedPathfinder(sizeIndex, levelIndex, from, to, token, tokenData, options);
	}
}

function calculatePath(from, to, options = {}) {
	const pathfinder = initializePathfinder(from, to, options);
	return createAsyncPathfinder(pathfinder);
}

function calculatePathBlocking(from, to, options = {}) {
	if (!Number.isFinite(options.maxDistance) || options.maxDistance < 0) {
		throw new RangeError("calculatePathBlocking requires a finite, nonnegative maxDistance; use calculatePath for unbounded searches.");
	}
	const pathfinder = initializePathfinder(from, to, options);

	try {
		let path;
		while (path === undefined) path = pathfinder.step();
		return path === null ? null : pathfinder.postProcessResult(path);
	} finally {
		pathfinder.free();
	}
}

Hooks.once("init", async () => {
	game.settings.register("routinglib", "gridlessTokenSizeRatio", {
		scope: "world",
		config: false,
		type: Number,
		default: 0.9,
		onChange: () => {
			if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
				cache.reset();
			}
		},
	});
});

Hooks.once("ready", async () => {
	foundryReady = true;
	initializeIfReady();
});

initGridlessPathfinding().then(() => {
	wasmReady = true;
	initializeIfReady();
});

function initializeIfReady() {
	if (!foundryReady || !wasmReady) return;
	initializeCaches();
	initializeBackground();
	window.routinglib = {calculatePath, calculatePathBlocking, cancelPathfinding};

	Hooks.on("canvasInit", () => {
		invalidateJobs();
		disposeCaches();
	});
	Hooks.on("canvasReady", initializeCaches);
	Hooks.on("createWall", wipeCaches);
	Hooks.on("updateWall", wipeCaches);
	Hooks.on("deleteWall", wipeCaches);
	Hooks.on("updateScene", (scene, changes) => {
		if (scene.id !== canvas.scene?.id) return;
		if (["grid", "width", "height", "padding"].some(key => key in changes)) {
			invalidateJobs();
			initializeCaches();
		}
	});

	Hooks.callAll("routinglib.ready");
}

function cancelPathfinding(promise) {
	return cancelJob(promise);
}
