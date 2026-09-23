import {getNativeMovementWaypoint} from "../js/util.js";

// Run manually in a loaded v14 test scene. This only queries routing/movement APIs;
// it never updates documents, moves a token, or executes region entry behaviors.
export async function runRoutingSmoke({token = canvas.tokens.controlled[0], destinations,
	maxDistance = 100, timeoutMs = 10000} = {}) {
	if (!canvas.ready || !token || !window.routinglib) throw new Error("Load a scene, enable routinglib, and select a token.");
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("timeoutMs must be finite and positive.");
	const scene = canvas.scene, document = token.document;
	const data = {token, width: document.width, height: document.height, depth: document._source.depth,
		shape: document._source.shape, elevation: document.elevation, level: document._source.level,
		action: document.movementAction};
	const center = document.getMovementOrigin();
	const gridless = canvas.grid.isGridless;
	const offset = gridless ? null : canvas.grid.getOffset(center);
	const from = gridless ? {x: center.x, y: center.y} : {x: offset.j, y: offset.i};
	const nativeStart = getNativeMovementWaypoint(from, data);
	if (Math.abs(nativeStart.x - document._source.x) > 1 || Math.abs(nativeStart.y - document._source.y) > 1) {
		throw new Error("Token position is not represented by RoutingLib's grid anchor. Test a snapped token first; record this placement for the integration review.");
	}
	if (!destinations) {
		destinations = gridless
			? [[1,0],[-1,0],[0,1],[0,-1]].map(([x,y]) => ({x: from.x + x * canvas.grid.size * 3, y: from.y + y * canvas.grid.size * 3}))
			: canvas.grid.getAdjacentOffsets(offset).map(({i,j}) => ({x:j,y:i}));
	}
	const reports = [];
	for (const to of destinations) {
		const start = performance.now();
		const report = {from: JSON.stringify(from), to: JSON.stringify(to)};
		let timer;
		try {
			if (canvas.scene !== scene) throw new Error("Active scene changed during the test.");
			const request = routinglib.calculatePath(from, to, {token, maxDistance, gridlessDistanceUnits: "scene", interpolate: false});
			const expired = Symbol("timeout");
			const route = await Promise.race([request, new Promise(resolve => {timer = setTimeout(() => resolve(expired), timeoutMs);})]);
			if (route === expired) {
				routinglib.cancelPathfinding(request);
				report.status = "TIMEOUT";
			} else if (!route) report.status = "NO_ROUTE";
			else {
				const waypoints = route.path.map(p => getNativeMovementWaypoint(p, data));
				const [constrained, changed] = token.constrainMovementPath(waypoints, {preview:false,ignoreCost:true,history:false});
				const measured = token.measureMovementPath(token.createTerrainMovementPath(waypoints, {preview:false}), {preview:false});
				const expected = waypoints.at(-1), last = constrained.at(-1), destination = route.path.at(-1);
				const complete = !changed && last && last.x === Math.round(expected.x) && last.y === Math.round(expected.y)
					&& last.elevation === expected.elevation && last.level === expected.level
					&& destination.x === to.x && destination.y === to.y;
				report.cost = route.cost; report.nativeCost = measured.cost; report.waypoints = route.path.length;
				const tolerance = 1e-7 * Math.max(1, Math.abs(measured.cost));
				report.status = complete && Number.isFinite(measured.cost) && Math.abs(route.cost - measured.cost) <= tolerance
					&& route.cost <= maxDistance + tolerance ? "PASS" : "FAIL";
			}
		} catch (error) { report.status = "ERROR"; report.error = error.message; }
		finally { clearTimeout(timer); report.ms = Math.round(performance.now() - start); }
		reports.push(report);
	}
	console.table(reports);
	return reports;
}
