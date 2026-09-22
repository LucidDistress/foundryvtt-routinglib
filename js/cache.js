import {resetJobs} from "./background.js";
import {getPixelsFromGridPositionObj} from "./foundry_fixes.js";
import {getSnapPointForTokenDataObj, isModuleActive} from "./util.js";

import * as GridlessPathfinding from "./gridless.js";

export let cache;

export function disposeCaches() {
	cache?.dispose();
	cache = undefined;
}

export function initializeCaches() {
	disposeCaches();
	if (!canvas?.ready) return;
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		cache = new GridlessCache();
	} else {
		cache = new GriddedCache();
	}
}

export function wipeCaches() {
	if (!cache || !canvas?.ready) return;
	cache.reset();
	resetJobs();
}

class Cache {
	constructor() {
		this.reset();
	}

	dispose() {}

	reset() {
		this.dispose();
		this.graphs = new Map();
	}

	getLevelIndexForElevation(elevation) {
		// Exact elevations avoid sharing a graph at inclusive wall-height boundaries.
		if (!Number.isFinite(elevation)) throw new RangeError("Elevation must be finite.");
		return elevation;
	}

}

export class GriddedCache extends Cache {
	reset() {
		super.reset();
		if (canvas.grid.isHexagonal && canvas.grid.columns) {
			this.gridWidth = Math.ceil(canvas.dimensions.width / ((3 / 4) * canvas.grid.sizeX));
		} else {
			this.gridWidth = Math.ceil(canvas.dimensions.width / canvas.grid.sizeX);
		}
		if (canvas.grid.isHexagonal && !canvas.grid.columns) {
			this.gridHeight = Math.ceil(canvas.dimensions.height / ((3 / 4) * canvas.grid.sizeY));
		} else {
			this.gridHeight = Math.ceil(canvas.dimensions.height / canvas.grid.sizeY);
		}
	}

	static getSnapPointIndexForTokenData(tokenData) {
		if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return 0;
		if (canvas.grid.isHexagonal) {
			if (tokenData.hexSizeSupport?.altSnappingFlag) {
				return tokenData.hexSizeSupport.borderSize % 2;
			} else {
				return 0;
			}
		}
		return tokenData.width % 2 | (tokenData.height % 2 << 1);
	}

	getInitializedNode(pos, sizeIndex, levelIndex, tokenData) {
		if (!Number.isInteger(pos.x) || !Number.isInteger(pos.y)
			|| pos.x < 0 || pos.y < 0 || pos.x >= this.gridWidth || pos.y >= this.gridHeight) {
			throw new RangeError("Grid coordinates must be integer cells inside the canvas.");
		}
		// Snap parity alone is insufficient: a 1x1, 3x3 and fractional token
		// can have different collision/snap behavior despite sharing that parity.
		const key = JSON.stringify([sizeIndex, tokenData.width, tokenData.height,
			tokenData.elevation, tokenData.size ?? null, tokenData.altOrientation ?? false,
			tokenData.hexSizeSupport?.altSnappingFlag ?? false,
			tokenData.hexSizeSupport?.borderSize ?? null,
			tokenData.hexSizeSupport?.altOrientationFlag ?? false]);
		let graph = this.graphs.get(key);
		if (!graph) this.graphs.set(key, graph = new Map());
		const positionKey = `${pos.x},${pos.y}`;
		let node = graph.get(positionKey);
		if (!node) {
			const neighbors = [];
			for (const neighborPos of canvas.grid.getAdjacentOffsets({i: pos.y, j: pos.x}).map(({i: y, j: x}) => {
				return {x, y};
			})) {
				if (
					neighborPos.x < 0 ||
					neighborPos.y < 0 ||
					neighborPos.x >= this.gridWidth ||
					neighborPos.y >= this.gridHeight
				) {
					continue;
				}
				if (!stepCollidesWithWall(pos, neighborPos, tokenData, true)) {
					const isDiagonal =
						pos.x !== neighborPos.x &&
						pos.y !== neighborPos.y &&
						canvas.grid.type === CONST.GRID_TYPES.SQUARE;
					neighbors.push({...neighborPos, isDiagonal});
				}
			}
			node = {...pos, neighbors};

			graph.set(positionKey, node);
		}
		return node;
	}

}

class GridlessCache extends Cache {
	dispose() {
		const graphs = this.graphs;
		this.graphs = new Map();
		for (const graph of graphs?.values() ?? []) GridlessPathfinding.freeGraph(graph);
	}

	getGraphFor(tokenSize, levelIndex, elevation) {
		const ratio = game.settings.get("routinglib", "gridlessTokenSizeRatio");
		const key = JSON.stringify([tokenSize, elevation, ratio, canvas.grid.size]);
		let graph = this.graphs.get(key);
		if (graph === undefined) {
			const tokenCalcSize = tokenSize * canvas.grid.size * ratio;
			graph = GridlessPathfinding.initializeGraph(
				canvas.walls.placeables, tokenCalcSize, elevation, isModuleActive("wall-height"));
			this.graphs.set(key, graph);
		}
		return graph;
	}
}

export function stepCollidesWithWall(from, to, tokenData, adjustPos = false) {
	const stepStart = getSnapPointForTokenDataObj(getPixelsFromGridPositionObj(from), tokenData);
	const stepEnd = getSnapPointForTokenDataObj(getPixelsFromGridPositionObj(to), tokenData);
	let adjustedStart;
	if (adjustPos) {
		// Using an adjusted position 1 pixel away from the center of the grid prevents the path from leaving
		// that square if a wall is dead-center. This prevents bugs where a token is allowed to move through walls
		// if it starts pathfinding on such a square.
		adjustedStart = {
			x: stepStart.x + Math.sign(stepStart.x - stepEnd.x),
			y: stepStart.y + Math.sign(stepStart.y - stepEnd.y),
		};
	} else {
		adjustedStart = stepStart;
	}
	adjustedStart.t = adjustedStart.b = tokenData.elevation;
	const source = new CONFIG.Canvas.visionSourceClass({});
	return CONFIG.Canvas.polygonBackends.move.testCollision(adjustedStart, stepEnd, {
		mode: "any",
		type: "move",
		source,
	});
}
