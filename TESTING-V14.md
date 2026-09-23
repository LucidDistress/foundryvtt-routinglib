# Foundry v14 integration test guide

## Build and installation

Use the ZIP attached to the successful **Validate routinglib** Actions run for the
commit being tested. CI runs JS and Rust tests, compiles fresh WASM, executes generated
bindings, and validates ZIP contents. It does not deploy or publish a release.

Extract `routinglib/` into the test Foundry data directory's `modules/`, replacing the
old module while Foundry is stopped. Start Foundry, enable routinglib and its consumer
(e.g. Rideable) in a test world, and reload clients. Confirm version `1.2.0-beta.1`.
The module ID stays `routinglib` for dependency compatibility. No `verified` claim or
automatic update URL is set yet.

## Read-only smoke test

Select one snapped token in a loaded scene. In the browser developer console:

```js
const {runRoutingSmoke} = await import("/modules/routinglib/tools/foundry-smoke.mjs");
await runRoutingSmoke();
```

For a Foundry URL with a route prefix, include that prefix before `/modules`.
The helper requests nearby routes, checks complete native constraints and compares
costs with native measurement. It does not move tokens, edit documents or trigger
region behaviors. `PASS` means the returned route passed those checks; `NO_ROUTE`
is inconclusive, not a pass. `TIMEOUT`, `ERROR` and `FAIL` need investigation.
Use longer requests by supplying explicit destinations in routing coordinates:

```js
await runRoutingSmoke({destinations: [{x: 12, y: 8}], maxDistance: 60, timeoutMs: 15000});
```

Square/hex coordinates are routing grid anchors (x=column, y=row); gridless coordinates
are token-center pixels. The helper derives the starting anchor from the token's
movement origin and rejects positions it cannot represent. Do not use token top-left
coordinates as a substitute for its routing anchor when testing large tokens.

## Live matrix

1. Square grids: all seven diagonal rules; exact budget and just below it; wall
   detours, closed/open doors, one-way walls in both directions, and endpoints on walls.
2. Levels: token on a different level from the GM view; walls on only one level;
   delete/change a level during a long request. No route may silently switch levels.
3. Terrain/actions: costly and impassable regions, overlapping regions, walking and
   teleportation; compare native measurement with returned cost. Repeat gridless.
4. Tokens: 1x1, 2x2, 3x3, rectangular, fractional; native hex sizes and both column/row
   orientations. Check that route origin matches the actual token and narrow passages
   behave consistently with Foundry's own movement constraints.
5. Lifecycle: switch scenes, edit walls/regions, change movement action, equip an item
   or toggle an effect during a long request. Expect a new route or null, never a route
   with stale context. Test linked and unlinked actors and a player client.
6. Rideable: rider/mount movement and following; ensure the consumer uses the same grid
   anchor convention. Record consumer version, token size, scene type and screenshots
   for coordinate mismatches. This external integration has not been certified.
7. Performance: a representative large map and a gridless map with many region vertices.
   Note response time and responsiveness while cancelling requests or editing geometry.

## Scope and acceptance

This is a 2D same-level/same-elevation API. Native collision determines clearance;
it does not guarantee a swept token footprint. Gridless candidate sampling can miss
continuous routes. Costs must be nonnegative and determined by position (plus diagonal
parity on grids), not arbitrary earlier path history. Final native rejection returns
null rather than searching again. Region-entry scripts are not a routing cost model.

Record Foundry/system/consumer versions, commit, scene grid and token dimensions with
failures. Complete the live matrix before adding a `verified` core version or publishing
a production release. Older Foundry versions are outside this beta's supported metadata.
