/** Cost of a square-grid edge in grid spaces. Parity is prior diagonal count modulo two. */
export function diagonalCost(rule, parity = 0) {
	const rules = CONST.GRID_DIAGONALS;
	switch (rule) {
		case rules.EQUIDISTANT: return 1;
		case rules.EXACT: return Math.SQRT2;
		case rules.APPROXIMATE: return 1.5;
		case rules.RECTILINEAR: return 2;
		case rules.ALTERNATING_1: return parity ? 2 : 1;
		case rules.ALTERNATING_2: return parity ? 1 : 2;
		case rules.ILLEGAL: return Infinity;
		default: throw new RangeError(`Unsupported diagonal rule: ${rule}`);
	}
}

export function isAlternating(rule) {
	return rule === CONST.GRID_DIAGONALS.ALTERNATING_1 || rule === CONST.GRID_DIAGONALS.ALTERNATING_2;
}

export function exceedsBudget(cost, budget) {
	// Tolerate arithmetic roundoff, not an extra fraction of a movement space.
	return cost - budget > 16 * Number.EPSILON * Math.max(1, Math.abs(cost), Math.abs(budget));
}
