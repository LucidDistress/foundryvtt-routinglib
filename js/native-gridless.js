import {PriorityQueueSet} from "./data_structures.js";
import {stepCollidesWithWall} from "./cache.js";
import {getNativeMovementWaypoint} from "./util.js";
import {exceedsBudget} from "./movement_cost.js";

// A visibility-graph search for v14 scenes. Candidate corners approximate a route
// around native edges; Foundry, not legacy wall documents, decides which directed
// segments can be traversed. Costs are nonnegative, so Dijkstra is conservative.
export class NativeGridlessPathfinder {
	constructor(from, to, tokenData, options) {
		this.from = {x: from.x, y: from.y};
		this.to = {x: to.x, y: to.y};
		this.tokenData = tokenData;
		this.token = tokenData.token;
		this.ignoreTerrain = options.ignoreTerrain ?? false;
		this.units = options.gridlessDistanceUnits ?? "pixels";
		if (!["pixels", "scene"].includes(this.units)) throw new RangeError("gridlessDistanceUnits must be pixels or scene.");
		this.sceneUnitsPerPixel = canvas.dimensions.distance / canvas.grid.size;
		if (!(this.sceneUnitsPerPixel > 0) || !Number.isFinite(this.sceneUnitsPerPixel)) throw new RangeError("Invalid scene distance scale.");
		this.maxCost = (options.maxDistance ?? Infinity) * (this.units === "pixels" ? this.sceneUnitsPerPixel : 1);
		this.reset();
	}

	reset() {
		const level = canvas.scene.levels.get(this.tokenData.level);
		if (!level) throw new Error("RoutingLib collision level no longer exists.");
		const rect = canvas.dimensions.rect;
		for (const point of [this.from, this.to]) {
			if (!rect.contains(point.x, point.y)) throw new RangeError("Gridless coordinates must be inside the canvas.");
		}
		const ratio = game.settings.get("routinglib", "gridlessTokenSizeRatio");
		if (!Number.isFinite(ratio) || ratio <= 0) throw new RangeError("gridlessTokenSizeRatio must be finite and positive.");
		const radius = Math.max(1, Math.max(this.tokenData.width, this.tokenData.height) * canvas.grid.size * ratio / 2);
		const restriction = this.token ? CONFIG.Token.movement.actions[this.tokenData.action]?.walls : "move";
		if (this.token && !CONFIG.Token.movement.actions[this.tokenData.action]) throw new Error("Unknown token movement action.");
		const points = new Map();
		const add = point => {
			if (Number.isFinite(point.x) && Number.isFinite(point.y) && rect.contains(point.x, point.y)) points.set(this.key(point), point);
		};
		const addCorners = endpoint => {
			for (let i = 0; i < 8; i++) {
				const angle = i * Math.PI / 4;
				add({x: Math.round(endpoint.x + radius * Math.cos(angle)), y: Math.round(endpoint.y + radius * Math.sin(angle))});
			}
		};
		// No wall corners are necessary for an action that ignores walls.
		if (restriction) for (const edge of level.edges.getEdges(rect)) {
			if (edge[restriction]) { addCorners(edge.a); addCorners(edge.b); }
		}
		// Include region boundaries so a costly/impassable region can be routed
		// around even in a room with no walls. Use document geometry, not animation.
		if (!this.ignoreTerrain && this.token) for (const region of canvas.scene.regions) {
			if (region.hidden) continue;
			for (const polygon of region.polygons) {
				for (let i = 0; i < polygon.points.length; i += 2) addCorners({x: polygon.points[i], y: polygon.points[i + 1]});
			}
		}
		add(this.from); add(this.to);
		this.points = [...points.values()];
		this.nativeTerrain = !this.ignoreTerrain && !!this.token;
		if (this.nativeTerrain && (typeof this.token.createTerrainMovementPath !== "function"
			|| typeof this.token.measureMovementPath !== "function")) throw new Error("Native token movement measurement is unavailable.");
		this.queue = new PriorityQueueSet((a, b) => a.key === b.key, n => n.cost);
		const start = {point: this.from, key: this.key(this.from), cost: 0, previous: null};
		this.queue.pushWithPriority(start);
		this.best = new Map([[start.key, 0]]);
		this.current = null;
		this.index = 0;
	}

	key(point) { return `${point.x},${point.y}`; }

	step() {
		if (!this.current) {
			const current = this.queue.pop();
			if (!current) return null;
			if (current.cost > this.best.get(current.key)) return undefined;
			if (current.key === this.key(this.to)) return current;
			this.current = current;
			this.index = 0;
		}
		// One candidate segment per step bounds work between scheduler yields.
		const current = this.current, point = this.points[this.index++];
		if (this.index >= this.points.length) this.current = null;
		const key = this.key(point);
		if (key === current.key || (this.best.get(key) ?? Infinity) <= current.cost) return undefined;
		if (stepCollidesWithWall(current.point, point, this.tokenData)) return undefined;
		let cost;
		if (this.nativeTerrain) {
			const waypoints = this.path(current).concat([point]).map(p => getNativeMovementWaypoint(p, this.tokenData));
			const terrain = this.token.createTerrainMovementPath(waypoints, {preview: false});
			cost = this.token.measureMovementPath(terrain, {preview: false}).cost;
			if (typeof cost !== "number" || Number.isNaN(cost) || cost < 0) throw new Error("Foundry returned an invalid movement measurement.");
			if (cost < current.cost) {
				if (exceedsBudget(current.cost, cost)) throw new Error("RoutingLib does not support negative incremental movement costs.");
				cost = current.cost;
			}
		} else cost = current.cost + Math.hypot(point.x - current.point.x, point.y - current.point.y) * this.sceneUnitsPerPixel;
		if (!Number.isFinite(cost) || exceedsBudget(cost, this.maxCost) || cost >= (this.best.get(key) ?? Infinity)) return undefined;
		this.best.set(key, cost);
		this.queue.pushWithPriority({point, key, cost, previous: current});
		return undefined;
	}

	path(node) {
		const points = [];
		for (let n = node; n; n = n.previous) points.push({...n.point});
		return points.reverse();
	}

	postProcessResult(node) {
		return {path: this.path(node), cost: node.cost / (this.units === "pixels" ? this.sceneUnitsPerPixel : 1)};
	}

	free() {
		this.queue = null;
		this.best = null;
		this.points = null;
		this.current = null;
	}
}
