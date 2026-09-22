// RoutingLib uses x=column, y=row. Foundry offsets use i=row, j=column.
export function getPixelsFromGridPosition(x, y) {
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return [x, y];
	const point = canvas.grid.getTopLeftPoint({i: y, j: x});
	return [point.x, point.y];
}
export function getGridPositionFromPixels(x, y) {
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return [x, y];
	const offset = canvas.grid.getOffset({x, y});
	return [offset.j, offset.i];
}
export function getGridPositionFromPixelsObj(o) {
	const [x, y] = getGridPositionFromPixels(o.x, o.y);
	return {x, y};
}
export function getPixelsFromGridPositionObj(o) {
	const [x, y] = getPixelsFromGridPosition(o.x, o.y);
	return {x, y};
}
export function getCenterFromGridPositionObj(o) {
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return {...o};
	return canvas.grid.getCenterPoint({i: o.y, j: o.x});
}
