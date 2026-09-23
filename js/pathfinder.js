import {diagonalCost, isAlternating, exceedsBudget} from "./movement_cost.js";
import {cache, stepCollidesWithWall} from "./cache.js";
import {PriorityQueueSet} from "./data_structures.js";
import {getCenterFromGridPositionObj} from "./foundry_fixes.js";
import {
	applyOffset,
	buildOffset,
	getAreaFromPositionAndShape,
	getTokenShapeForTokenData,
	getNativeMovementWaypoint,
} from "./util.js";

import * as GridlessPathfinding from "./gridless.js";

export class GriddedPathfinder {
	constructor(sizeIndex, levelIndex, from, to, token, tokenData, options) {
		this.sizeIndex = sizeIndex;
		this.levelIndex = levelIndex;
		this.targetPos = {x: to.x, y: to.y};
		this.startPos = {x: from.x, y: from.y};
		this.token = token;
		this.tokenData = tokenData;
		this.tokenShape = getTokenShapeForTokenData(tokenData);
		this.startCost = 0; // TODO Allow specifying a start cost
		this.interpolate = options.interpolate ?? true;
		this.maxDistance = options.maxDistance ?? Infinity;
		this.maxDistance = this.maxDistance / canvas.scene.dimensions.distance;
		this.ignoreTerrain = options.ignoreTerrain ?? false;
		this.reset();
	}

	reset() {
		this.diagonalRule = canvas.grid.diagonals ?? CONST.GRID_DIAGONALS.EQUIDISTANT;
		this.alternating = canvas.grid.type === CONST.GRID_TYPES.SQUARE && isAlternating(this.diagonalRule);
		this.nativeTerrain = !this.ignoreTerrain && !!canvas.scene.levels
			&& typeof this.token?.createTerrainMovementPath === "function"
			&& typeof this.token?.measureMovementPath === "function"
			&& typeof this.token?.document.getMovementOrigin === "function";
		this.terrain = !this.nativeTerrain && !!window.terrainRuler && !this.ignoreTerrain;
		this.nextNodes = new PriorityQueueSet(
			(node1, node2) => node1.key === node2.key,
			node => node.estimated,
		);
		this.bestCosts = new Map();
		this.gridWidth = Math.ceil(canvas.dimensions.width / canvas.grid.sizeX);
		this.gridHeight = Math.ceil(canvas.dimensions.height / canvas.grid.sizeY);
		// Validate both endpoints before expanding any collision graph. An invalid
		// destination otherwise forces a futile search across the entire canvas.
		cache.validatePosition(this.startPos);
		cache.validatePosition(this.targetPos);
		this.startNode = cache.getInitializedNode(
			this.startPos,
			this.sizeIndex,
			this.levelIndex,
			this.tokenData,
		);
		const key = this.stateKey(this.startNode, 0);
		this.bestCosts.set(key, this.startCost);
		this.nextNodes.pushWithPriority({
			key,
			parity: 0,
			node: this.startNode,
			cost: this.startCost,
			estimated: this.startCost + this.estimateCost(this.startPos, this.targetPos),
			previous: null,
		});
	}

	step() {
		const currentNode = this.nextNodes.pop();
		if (!currentNode) {
			return null;
		}
		if (exceedsBudget(this.displayCost(currentNode.cost), this.maxDistance) || currentNode.cost > this.bestCosts.get(currentNode.key)) {
			return undefined;
		}
		if (currentNode.node.x === this.targetPos.x && currentNode.node.y === this.targetPos.y) {
			return currentNode;
		}
		const tokenArea = getAreaFromPositionAndShape(currentNode.node, this.tokenShape);
		for (const neighbor of currentNode.node.neighbors) {
			const neighborNode = cache.getInitializedNode(
				neighbor,
				this.sizeIndex,
				this.levelIndex,
				this.tokenData,
			);
			let cost;
			let nativeMeasurement;
			if (this.nativeTerrain) {
				nativeMeasurement = this.measureNativeRoute(currentNode, neighborNode);
				cost = nativeMeasurement.cost - currentNode.cost;
				if (cost < 0 && !exceedsBudget(currentNode.cost, nativeMeasurement.cost)) cost = 0;
				if (cost < 0) throw new Error("RoutingLib does not support negative incremental movement costs.");
			} else if (this.terrain) {
				const offset = buildOffset(currentNode.node, neighbor);
				cost = this.terrainCostForStep(tokenArea, offset, currentNode.cost);
			} else {
				// Keep tie-breaking out of movement cost so exact-distance routes remain reachable.
				cost = neighbor.isDiagonal ? diagonalCost(this.diagonalRule, currentNode.parity) : 1;
			}

			if (!Number.isFinite(cost) || cost < 0) continue;
			cost += currentNode.cost;
			const parity = this.nativeTerrain ? nativeMeasurement.parity : this.terrain ? (cost % 1 >= 0.25 ? 1 : 0)
				: (this.alternating && neighbor.isDiagonal ? 1 - currentNode.parity : currentNode.parity);
			const key = this.stateKey(neighborNode, parity);
			if (exceedsBudget(this.displayCost(cost), this.maxDistance) || cost >= (this.bestCosts.get(key) ?? Infinity)) continue;
			this.bestCosts.set(key, cost);
			this.nextNodes.pushWithPriority({
				key,
				parity,
				node: neighborNode,
				cost: cost,
				estimated: cost + this.estimateCost(neighborNode, this.targetPos),
				previous: currentNode,
			});
		}
		return undefined;
	}

	terrainCostForStep(tokenArea, offset, previousDistance = 0) {
		let distance = 0;
		for (const srcCell of tokenArea) {
			const dstCell = applyOffset(srcCell, offset);
			// TODO Cache the result of source->destination measurements to speed up the pathfinding for large tokens
			const ray = new foundry.canvas.geometry.Ray(
				getCenterFromGridPositionObj(srcCell),
				getCenterFromGridPositionObj(dstCell),
			);
			const options = {};
			let halfStep = previousDistance % 1;
			if (halfStep > 0.25 && halfStep < 0.75) {
				options.terrainRulerInitialState = {noDiagonals: 1};
			}
			let measured = terrainRuler.measureDistances([{ray}], {token: this.token})[0];
			// TODO Maybe terrain ruler could just return the distance in cells in the first place
			measured = Math.round(measured / canvas.dimensions.distance);
			if (ray.terrainRulerFinalState?.noDiagonals === 1) {
				measured += 0.5;
			}
			distance = Math.max(distance, measured);
		}
		return distance;
	}

	postProcessResult(firstNode) {
		const path = [];
		const cost = this.displayCost(firstNode.cost) * canvas.dimensions.distance;
		let currentNode = firstNode;
		while (currentNode) {
			// Preserve turns: removing them can change diagonal parity, measured cost,
			// or create an illegal diagonal. Only collapse straight square-grid runs.
			if (this.interpolate && !this.terrain && !this.nativeTerrain && canvas.grid.type === CONST.GRID_TYPES.SQUARE && path.length >= 2) {
				const a = path[path.length - 2], b = path[path.length - 1], c = currentNode.node;
				const dx1 = b.x - a.x, dy1 = b.y - a.y;
				const dx2 = c.x - b.x, dy2 = c.y - b.y;
				if (dx1 * dy2 === dy1 * dx2 && dx1 * dx2 + dy1 * dy2 > 0
					&& !stepCollidesWithWall(c, a, this.tokenData)) path.pop();
			}

			path.push({x: currentNode.node.x, y: currentNode.node.y});
			currentNode = currentNode.previous;
		}
		path.reverse();
		return {path, cost};
	}

	measureNativeRoute(current, next) {
		// Measure the whole prefix: independently measured edges would restart the
		// alternating-diagonal count at every region boundary or grid step.
		const positions = [next];
		for (let entry = current; entry; entry = entry.previous) positions.push(entry.node);
		positions.reverse();
		const waypoints = positions.map(position => getNativeMovementWaypoint(position, {...this.tokenData, token: this.token}));
		const regionalized = this.token.createTerrainMovementPath(waypoints, {preview: false});
		const measurement = this.token.measureMovementPath(regionalized, {preview: false});
		const cost = measurement.cost / canvas.dimensions.distance;
		if (Number.isNaN(cost) || cost < 0 || !Number.isInteger(measurement.diagonals) || measurement.diagonals < 0) {
			throw new Error("Foundry returned an invalid movement measurement.");
		}
		return {cost, parity: measurement.diagonals % 2};
	}

	stateKey(node, parity) {
		return `${node.x},${node.y},${this.alternating || this.terrain || this.nativeTerrain ? parity : 0}`;
	}

	displayCost(cost) {
		// Legacy terrain-ruler encodes its pending diagonal as a half-space.
		return this.terrain ? Math.floor(cost) : cost;
	}

	estimateCost(pos, target) {
		// Zero is conservative for hex offset coordinates, terrain and alternating
		// diagonals; these must not overestimate a remaining route.
		if (canvas.grid.type !== CONST.GRID_TYPES.SQUARE || this.terrain || this.nativeTerrain || this.alternating) return 0;
		const dx = Math.abs(pos.x - target.x), dy = Math.abs(pos.y - target.y);
		const d = diagonalCost(this.diagonalRule);
		return Math.max(dx, dy) + Math.min(dx, dy) * (Math.min(d, 2) - 1);
	}

	free() {
		// The gridded pathfinder is 100% Javascript, so we don't need to do anything
	}
}

export class GridlessPathfinder {
	constructor(graph, from, to, options, getGraph) {
		this.getGraph = getGraph;
		this.from = {x: from.x, y: from.y};
		this.to = {x: to.x, y: to.y};
		this.distanceUnits = options.gridlessDistanceUnits ?? "pixels";
		if (!["pixels", "scene"].includes(this.distanceUnits)) throw new RangeError("gridlessDistanceUnits must be pixels or scene.");
		this.unitsPerPixel = this.distanceUnits === "scene" ? canvas.dimensions.distance / canvas.grid.size : 1;
		if (!(this.unitsPerPixel > 0) || !Number.isFinite(this.unitsPerPixel)) throw new RangeError("Invalid scene distance scale.");
		this.maxDistance = (options.maxDistance ?? Infinity) / this.unitsPerPixel;
		this.pathfinder = GridlessPathfinding.initializePathfinder(this.from, this.to, graph, this.maxDistance);
	}

	reset() {
		if (this.getGraph) {
			// Construct the replacement first, so failure leaves a valid handle to free.
			const replacement = GridlessPathfinding.initializePathfinder(this.from, this.to, this.getGraph(), this.maxDistance);
			const previous = this.pathfinder;
			this.pathfinder = replacement;
			GridlessPathfinding.dropPathfinder(previous);
		} else GridlessPathfinding.resetPathfinder(this.pathfinder);
	}

	step() {
		return GridlessPathfinding.step(this.pathfinder);
	}

	postProcessResult(result) {
		// wasm-bindgen points own Rust allocations. Do not expose their lifetime
		// to callers: copy coordinates and release every wrapper, even on failure.
		try {
			return {path: result.path.map(point => ({x: point.x, y: point.y})),
				cost: result.cost * this.unitsPerPixel};
		} finally {
			let cleanupError;
			for (const point of result.path) {
				try { point.free?.(); } catch (error) { cleanupError ??= error; }
			}
			if (cleanupError) throw cleanupError;
		}
	}

	free() {
		if (this.pathfinder == null) return;
		const handle = this.pathfinder;
		this.pathfinder = null;
		GridlessPathfinding.dropPathfinder(handle);
	}
}
