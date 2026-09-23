import {getPixelsFromGridPositionObj} from "./foundry_fixes.js";
export function getSnapPointForToken(x, y, token) {
	return getSnapPointForTokenData(x, y, buildSnapPointTokenData(token));
}

export function getSnapPointForTokenDataObj(pos, tokenData) {
	return getSnapPointForTokenData(pos.x, pos.y, tokenData);
}

// A copy of this function lives in the Drag Ruler module
function getSnapPointForTokenData(x, y, tokenData) {
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		return new PIXI.Point(x, y);
	}
	if (canvas.grid.isHexagonal) {
		if (tokenData.hexSizeSupport?.altSnappingFlag) {
			if (tokenData.hexSizeSupport.borderSize % 2 === 0) {
				const snapPoint = findVertexSnapPoint(x, y, tokenData.hexSizeSupport.altOrientationFlag);
				return new PIXI.Point(snapPoint.x, snapPoint.y);
			} else {
				const center = canvas.grid.getCenterPoint({x, y});
				return new PIXI.Point(center.x, center.y);
			}
		} else {
			const center = canvas.grid.getCenterPoint({x, y});
				return new PIXI.Point(center.x, center.y);
		}
	}

	const {x: topLeftX, y: topLeftY} = canvas.grid.getTopLeftPoint({x, y});
	let cellX, cellY;
	if (tokenData.width % 2 === 0) cellX = x - canvas.grid.sizeX / 2;
	else cellX = x;
	if (tokenData.height % 2 === 0) cellY = y - canvas.grid.sizeY / 2;
	else cellY = y;
	const {x: centerX, y: centerY} = canvas.grid.getCenterPoint({x: cellX, y: cellY});
	let snapX, snapY;
	// Tiny tokens can snap to the cells corners
	if (tokenData.width <= 0.5) {
		const offsetX = x - topLeftX;
		const subGridWidth = Math.floor(canvas.grid.sizeX / 2);
		const subGridPosX = Math.floor(offsetX / subGridWidth);
		snapX = topLeftX + (subGridPosX + 0.5) * subGridWidth;
	}
	// Tokens with odd multipliers (1x1, 3x3, ...) and tokens smaller than 1x1 but bigger than 0.5x0.5 snap to the center of the grid cell
	else if (Math.round(tokenData.width) % 2 === 1 || tokenData.width < 1) {
		snapX = centerX;
	}
	// All remaining tokens (those with even or fractional multipliers on square grids) snap to the intersection points of the grid
	else {
		snapX = centerX + canvas.grid.sizeX / 2;
	}
	if (tokenData.height <= 0.5) {
		const offsetY = y - topLeftY;
		const subGridHeight = Math.floor(canvas.grid.sizeY / 2);
		const subGridPosY = Math.floor(offsetY / subGridHeight);
		snapY = topLeftY + (subGridPosY + 0.5) * subGridHeight;
	} else if (Math.round(tokenData.height) % 2 === 1 || tokenData.height < 1) {
		snapY = centerY;
	} else {
		snapY = centerY + canvas.grid.sizeY / 2;
	}
	return new PIXI.Point(snapX, snapY);
}

export function isModuleActive(moduleName) {
	return game.modules.get(moduleName)?.active;
}

// A copy of this function lives in the drag ruler module
export function getHexTokenSize(token) {
	const size = token.document.width;
	if (token.document.height !== size) {
		return 1;
	}
	return size;
}

// A copy of this function lives in the drag ruler module
export function getAltOrientationFlagForToken(token, size) {
	const hexSizeSupport = game.modules.get("hex-size-support")?.api;
	if (hexSizeSupport) {
		return hexSizeSupport.isAltOrientation(token);
	}
	// In native foundry, tokens of size 2 are oriented like the "alt orientation" from hex-size-support
	// Tokens of size 4 are oriented like alt orientation wasn't set
	return size === 2;
}

// A copy of this function lives in the drag ruler module
export function getTokenShapeForTokenData(tokenData, scene = canvas.scene) {
	if (scene.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		return [{x: 0, y: 0}];
	} else if (scene.grid.type === CONST.GRID_TYPES.SQUARE) {
		const topOffset = -Math.floor(tokenData.height / 2);
		const leftOffset = -Math.floor(tokenData.width / 2);
		const shape = [];
		for (let y = 0; y < tokenData.height; y++) {
			for (let x = 0; x < tokenData.width; x++) {
				shape.push({x: x + leftOffset, y: y + topOffset});
			}
		}
		return shape;
	} else {
		// Hex grids
		const size = tokenData.size;
		let shape = [{x: 0, y: 0}];
		if (size >= 2)
			shape = shape.concat([
				{x: 0, y: -1},
				{x: -1, y: -1},
			]);
		if (size >= 3)
			shape = shape.concat([
				{x: 0, y: 1},
				{x: -1, y: 1},
				{x: -1, y: 0},
				{x: 1, y: 0},
			]);
		if (size >= 4)
			shape = shape.concat([
				{x: -2, y: -1},
				{x: 1, y: -1},
				{x: -1, y: -2},
				{x: 0, y: -2},
				{x: 1, y: -2},
			]);

		if (tokenData.altOrientation) {
			shape.forEach(space => (space.y *= -1));
		}
		if (canvas.grid.columns)
			shape = shape.map(space => {
				return {x: space.y, y: space.x};
			});
		return shape;
	}
}

// We cannot write objects into sets, so we calculate a id from the nodes coordinates instead
export function nodeId(node) {
	// This will work with grids of up to 2^16x2^16, so it should be fine
	return (node.x << 16) | node.y;
}

export function getAreaFromPositionAndShape(position, shape) {
	return shape.map(space => {
		let x = position.x + space.x;
		let y = position.y + space.y;
		if (canvas.grid.isHexagonal) {
			let shiftedRow;
			if (canvas.grid.even) shiftedRow = 1;
			else shiftedRow = 0;
			if (canvas.grid.columns) {
				if (space.x % 2 !== 0 && position.x % 2 !== shiftedRow) {
					y += 1;
				}
			} else {
				if (space.y % 2 !== 0 && position.y % 2 !== shiftedRow) {
					x += 1;
				}
			}
		}
		return {x, y};
	});
}

export function buildOffset(startPos, endPos) {
	const offset = {x: endPos.x - startPos.x, y: endPos.y - startPos.y};
	if (canvas.grid.isHexagonal) {
		if (canvas.grid.columns) {
			offset.adjustmentNeeded = (startPos.x - endPos.x) % 2 !== 0;
			offset.originEven = startPos.x % 2 === 0;
		} else {
			offset.adjustmentNeeded = (startPos.y - endPos.y) % 2 !== 0;
			offset.originEven = startPos.y % 2 === 0;
		}
	}
	return offset;
}

export function applyOffset(origin, offset) {
	const pos = {x: origin.x + offset.x, y: origin.y + offset.y};
	if (canvas.grid.isHexagonal && offset.adjustmentNeeded) {
		if (canvas.grid.columns) {
			if ((origin.x % 2 === 0) !== offset.originEven) {
				if (offset.originEven === canvas.grid.even) {
					pos.y -= 1;
				} else {
					pos.y += 1;
				}
			}
		} else {
			if ((origin.y % 2 === 0) !== offset.originEven) {
				if (offset.originEven === canvas.grid.even) {
					pos.x -= 1;
				} else {
					pos.x += 1;
				}
			}
		}
	}
	return pos;
}

// Routing coordinates retain their existing snap-center convention. Native
// movement APIs require top-left waypoints and a feet elevation instead.
export function getNativeMovementWaypoint(position, tokenData) {
	const {token, width, height, depth, shape, elevation, level, action} = tokenData;
	const center = getSnapPointForTokenDataObj(getPixelsFromGridPositionObj(position), tokenData);
	const pivot = token.document.getMovementOrigin({x: 0, y: 0, elevation: 0, width, height, depth, shape});
	return {x: center.x - pivot.x, y: center.y - pivot.y,
		elevation, width, height, depth, shape, level, action};
}

// Segment checks can have different wall-boundary offsets than a complete path.
// Validate the returned route as a whole before giving it to a movement caller.
export function nativeRouteIsComplete(positions, tokenData) {
	const token = tokenData.token;
	if (!canvas.scene?.levels || typeof token?.constrainMovementPath !== "function") return true;
	const waypoints = positions.map(position => getNativeMovementWaypoint(position, tokenData));
	const expected = waypoints.at(-1);
	const [path, constrained] = token.constrainMovementPath(waypoints, {
		preview: false, ignoreWalls: false, ignoreCost: true, history: false
	});
	const last = path.at(-1);
	return !constrained && !!last && path.length >= waypoints.length
		&& last.x === Math.round(expected.x) && last.y === Math.round(expected.y)
		&& last.elevation === expected.elevation && last.level === expected.level;
}
