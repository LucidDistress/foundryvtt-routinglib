import {initializeBackground, createAsyncPathfinder, cancelJob, invalidateJobs} from "./background.js";
import {cache, GriddedCache, initializeCaches, wipeCaches, disposeCaches} from "./cache.js";
import {GriddedPathfinder, GridlessPathfinder} from "./pathfinder.js";

import initGridlessPathfinding from "./gridless.js";
import {getAltOrientationFlagForToken, getHexTokenSize, isModuleActive} from "./util.js";

let foundryReady = false;
let wasmSettled = false;
let wasmAvailable = false;
let initialized = false;

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
		if (token.scene?.id !== undefined && token.scene.id !== canvas.scene.id) {
			throw new Error("RoutingLib token must belong to the active scene.");
		}
		tokenData = {width: token.document.width, height: token.document.height, token,
			depth: token.document._source?.depth ?? token.document.depth,
			shape: token.document._source?.shape ?? token.document.shape,
			action: token.document.movementAction};
		if (elevation == null) {
			elevation =
				!canvas.scene.levels && isModuleActive("wall-height") && token.losHeight != null
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

	if (!Number.isFinite(elevation)) throw new RangeError("Elevation must be finite.");
	if (![tokenData.width, tokenData.height].every(size => Number.isFinite(size) && size > 0)) {
		throw new RangeError("Token dimensions must be finite positive numbers.");
	}
	tokenData.elevation = elevation;
	// A token route always belongs to its own level, even when the GM views another.
	const tokenLevel = token?.document._source?.level ?? token?.document.level;
	tokenData.level = token ? tokenLevel : (options.level ?? canvas.level?.id);
	if (canvas.scene.levels && !canvas.scene.levels.get(tokenData.level)) {
		throw new Error("RoutingLib requires a valid native scene level.");
	}
	if (token && options.level != null && options.level !== tokenLevel) {
		throw new Error("RoutingLib cannot route a token on a different level.");
	}

	const levelIndex = cache.getLevelIndexForElevation(elevation);
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		if (!wasmAvailable) throw new Error("RoutingLib gridless engine is unavailable; install the WASM assets and reload Foundry.");
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
	// Do not mark this function async: callers cancel using this exact promise.
	try {
		return createAsyncPathfinder(initializePathfinder(from, to, options));
	} catch (error) {
		return Promise.reject(error);
	}
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
			if (canvas?.ready && canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
				wipeCaches();
			}
		},
	});
});

Hooks.once("ready", async () => {
	foundryReady = true;
	initializeIfReady();
});

initGridlessPathfinding().then(() => {
	wasmAvailable = true;
}, error => {
	console.warn("RoutingLib: gridless engine failed to load; gridded routing remains available.", error);
}).then(() => {
	wasmSettled = true;
	initializeIfReady();
});

function initializeIfReady() {
	if (initialized || !foundryReady || !wasmSettled) return;
	initialized = true;
	initializeCaches();
	initializeBackground();
	window.routinglib = {calculatePath, calculatePathBlocking, cancelPathfinding, isGridlessAvailable: () => wasmAvailable};

	const clearScene = () => {
		invalidateJobs();
		disposeCaches();
	};
	Hooks.on("canvasTearDown", clearScene);
	Hooks.on("canvasInit", clearScene);
	Hooks.on("canvasReady", initializeCaches);
	const onWallChange = wall => {
		if (wall.parent?.id === canvas.scene?.id) wipeCaches();
	};
	Hooks.on("createWall", onWallChange);
	Hooks.on("updateWall", onWallChange);
	Hooks.on("deleteWall", onWallChange);
	// Requests contain a snapshot of the token's dimensions and level. Do not
	// resume them with a changed document and stale collision context.
	Hooks.on("updateToken", (token, changes) => {
		if (token.parent?.id !== canvas.scene?.id) return;
		const fields = ["width", "height", "depth", "shape", "elevation", "level", "movementAction", "flags", "actorId", "actorLink", "delta"];
		if (Object.keys(changes).some(key => fields.includes(key.split(".")[0]))) {
			invalidateJobs();
			initializeCaches();
		}
	});
	// Systems and modules can derive movement rules from arbitrary actor, item
	// or effect data. Invalidate conservatively, but only for actors on this canvas.
	const onActorContextChange = document => {
		if (!canvas?.ready) return;
		let actor = document;
		while (actor && actor.documentName !== "Actor") actor = actor.parent;
		if (!actor) return;
		const present = canvas.tokens?.placeables?.some(token => {
			const candidate = token.actor;
			if (!candidate) return false;
			if (candidate === actor) return true;
			if (candidate.uuid && actor.uuid && candidate.uuid === actor.uuid) return true;
			// Base actor changes can also affect inherited synthetic actor data.
			// A synthetic edit must never match another token by base ID alone.
			return !actor.isToken && actor.id != null && candidate.id === actor.id;
		});
		if (!present) return;
		invalidateJobs();
		initializeCaches();
	};
	for (const name of ["Actor", "Item", "ActiveEffect"]) {
		for (const operation of ["create", "update", "delete"]) {
			Hooks.on(`${operation}${name}`, onActorContextChange);
		}
	}
	// Synthetic actor edits can arrive as ActorDelta updates on an unlinked token.
	for (const operation of ["create", "update", "delete"]) {
		Hooks.on(`${operation}ActorDelta`, delta => {
			if (!canvas?.ready || !canvas.scene?.id || delta.parent?.parent?.id !== canvas.scene.id) return;
			invalidateJobs();
			initializeCaches();
		});
	}
	for (const event of ["createLevel", "updateLevel", "deleteLevel"]) {
		Hooks.on(event, level => {
			if (level.parent?.id !== canvas.scene?.id) return;
			invalidateJobs();
			initializeCaches();
		});
	}
	const onRegionChange = document => {
		const scene = document.documentName === "RegionBehavior" ? document.parent?.parent : document.parent;
		if (scene?.id !== canvas.scene?.id) return;
		invalidateJobs();
		initializeCaches();
	};
	for (const name of ["Region", "RegionBehavior"]) {
		for (const operation of ["create", "update", "delete"]) Hooks.on(`${operation}${name}`, onRegionChange);
	}
	Hooks.on("updateScene", (scene, changes) => {
		if (scene.id !== canvas.scene?.id) return;
		if (Object.keys(changes).some(key => ["grid", "width", "height", "padding"].includes(key.split(".")[0]))) {
			invalidateJobs();
			initializeCaches();
		}
	});

	Hooks.callAll("routinglib.ready");
}

function cancelPathfinding(promise) {
	return cancelJob(promise);
}
