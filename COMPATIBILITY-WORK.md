# RoutingLib modernization: work in progress

This checkout is not yet a verified Foundry v14 release. Do not deploy it as one.
The removed `verified: 11` claim is intentional; the new public grid calls require
v12 or later. Runtime verification remains pending. Release URLs are unchanged
until a release is actually built and published in this fork.

## Implemented
- Remove unsupported allowBugReporter manifest field.
- Retain the cheaper equivalent queue entry and prevent duplicates.
- Isolate search, result-processing, cleanup, and reset failures between jobs.
- Schedule work asynchronously in 10 ms slices (individual steps can exceed this).
- Preserve explicit zero elevation and validate inputs for blocking searches.
- Always release blocking search resources.
- Use modern grid coordinates, dimensions, orientation, neighbors, and Ray APIs.
- Keep x=column/y=row at the public API boundary, including hex offsets.
- Remove artificial diagonal movement cost; allow exact displayed-distance budgets.
- Sort legacy height boundaries numerically.
- Pass the gridless reset handle; reacquire graphs after obstacle changes.
- Release cached WASM graphs; invalidate pending searches on scene changes.
- Scene invalidation resolves requests with null; explicit cancel retains the existing
  documented unresolved-promise behavior for compatibility.
- Locate wasm-pack on PATH or in Cargo's platform-specific bin directory; treat
  absent optional localization files correctly when packaging.

## Remaining before release
- Validate the native terrain measurement integration in live Foundry and finish
  token-footprint collision handling. Gridded token wall checks delegate
  to native movement constraints with action, level and height context; full v14
  movement compatibility is not yet established.
- Verify diagonal rules in Foundry after the isolated distance regression suite.
- Complete the WASM rebuild and runtime validation for the Rust distance fixes.
- Test hex token sizes/orientations, narrow passages, one-way walls, doors,
  scene switching, and Rideable in Foundry.
- Extend native level/directional-wall handling to the Rust gridless engine.
- Rebuild WASM and inspect the final release archive; no generated binary is borrowed
  from another fork. Rust/wasm-pack must be installed to perform that build.
- Update release version/URLs and verified core only after runtime validation.

## Validation
Run `node --test tests/regression.test.mjs`.
These are isolated source-level regression tests, not a Foundry integration suite.

## Research references
Reviewed ideas from ByteBard97 (gridless reset and grid-change invalidation),
tatsumasagc (modern grid APIs), and IronWarjack (release packaging).
The implementation retains upstream module identity and attribution; entire forks
and their experimental collision replacements were not merged.

## Batch 2: movement costs
- Follow all seven scene diagonal rules without a system-ID override.
- Keep alternating-diagonal parity in the search state and allow cheaper states to reopen.
- Preserve fractional costs and use roundoff-only budget tolerance.
- Use conservative heuristics for alternating, terrain and hex searches; these may
  expand more nodes but cannot discard a shorter route based on an overestimate.
- Preserve turns during interpolation; retain terrain/hex waypoints.
- Add opt-in scene-unit gridless budgets/results while retaining legacy pixel defaults.
- Compare routes to independent exhaustive relaxation across 40 obstructed grids and
  all seven rules, including exact/just-under budgets. WASM conversion tests use a
  boundary stub and are not an execution test of the Rust binary.

Run all checks with `node --test tests/*.test.mjs`.

## Batch 3: cache identity and invalidation
- Replace snap-parity/elevation-band graph sharing with full token dimensions,
  exact elevation, orientation, and legacy snapping options.
- Use sparse maps for visited grid cells and validate integer canvas bounds.
- Keep gridless graphs separate by exact elevation, token size, ratio and grid scale.
- Clear graph ownership before disposal so repeated cleanup cannot free a handle twice.
- Ignore wall edits in other scenes; recognize nested and dotted grid scene updates.
- Changing the gridless token-size ratio resets queued searches as well as caches.
- Validate finite elevations and positive finite token dimensions at the API boundary.

These changes prevent cache reuse across different inputs; they do not add token
footprint collision checks or native v14 levels/regions. Cache tests inject collision
and WASM boundaries. Hook tests use simulated Foundry events. Live integration and
WASM execution remain pending. Exact elevation keys trade some reuse for correctness;
caches are cleared on geometry changes and scene transitions.

## Batch 4: startup and cancellation
- Load generated gridless bindings dynamically so missing/broken WASM assets no
  longer prevent the JavaScript gridded API from loading.
- Publish the ready hook once after Foundry is ready and engine initialization
  settles; log a gridless load failure and reject gridless requests explicitly.
- Add `routinglib.isGridlessAvailable()` for callers to check the optional engine.
- Async request validation rejects a promise instead of throwing synchronously;
  valid requests retain their exact promise identity for cancellation.
- Cancelled jobs leave the queue before cleanup; cleanup failure rejects only that
  job and cannot strand or execute it later. Successful explicit cancellation keeps
  the existing unresolved-promise behavior.
- Invalidate pending work at canvas teardown as well as initialization.

Startup tests simulate missing assets, binding delegation, ready ordering, request
validation and teardown. Actual WASM compilation and live Foundry remain pending.

## Batch 5: native gridded wall collision
- Delegate token queries to Token.checkCollision in the direction of travel, using
  explicit origin, destination, movement type and token movement-origin elevation.
- Use the token's own native level, not the GM's viewed level; reject missing/stale
  levels and tokens belonging to another scene.
- Use PointMovementSource for tokenless queries and destroy it after each check.
- Partition caches by token object identity, level, depth and shape as well as size
  and elevation. Invalidate requests on relevant token edits and level changes.
- Preserve square/hex routing coordinate conventions; full token-footprint clearance
  and native shape positioning still need integration tests and further work.
- On v14 use the native movement origin rather than the legacy wall-height sight height.

Verified API behavior against the installed v14 Token.checkCollision,
TokenDocument.getMovementOrigin and movement polygon source. New tests simulate
native collision responses to verify argument forwarding, level isolation, direction,
errors, cleanup and invalidation; no live scene movement was performed.

Scope: square/hex wall queries only. This does not add vertical routes between levels,
region movement rules, or native level support to the Rust gridless engine.
References:
- https://foundryvtt.com/api/classes/foundry.canvas.placeables.Token.html#checkCollision
- https://foundryvtt.com/api/classes/foundry.canvas.sources.PointMovementSource.html

## Batch 6: Rust distance correctness and build dependencies
- Remove the per-edge distance penalty and report actual route cost through the JS API.
- Prune over-budget candidates using roundoff-only tolerance.
- Normalize signed zero when hashing points, matching floating-point equality.
- Add five native Rust regression tests for exact/insufficient budgets, detours,
  zero/unbounded requests, roundoff and signed-zero lookup.
- Update wasm-bindgen/js-sys minimum versions and Cargo.lock after the old locked
  wasm-bindgen failed compilation with current Rust. Lock resolves wasm-bindgen
  0.2.128 and js-sys 0.3.105. Release builds now enforce --locked.
- Add tools/test-wasm.mjs to check generated web bindings, native graph ownership,
  exact budgets and detour costs against the actual binary.

Validation: all five Rust tests passed on isolated Rust 1.98.1 Windows GNU tooling;
all 22 JavaScript tests passed. No normal PATH or user Rust installation changed.
The toolchain resides in the temporary routinglib-rust-tools directory.

WASM release build attempted with wasm-pack 0.15.0. Windows Application Control
blocked the generated rustversion release build script (OS error 4551). This is
an OS execution-policy blocker, not a test failure. No policy bypass was attempted.
The WASM runtime test script has been syntax-checked but has NOT run against a rebuilt
binary. Build/package/live Foundry verification remains pending in an approved build
environment. Nothing was deployed.

## Batch 7: native region movement costs
- Token-based gridded searches use v14 createTerrainMovementPath and
  measureMovementPath when available, with preview=false. Native measurement takes
  precedence over the legacy terrain-ruler integration.
- Measure each complete candidate prefix so diagonals are not restarted per edge.
  Keep measured diagonal parity in search state and use a conservative heuristic.
- Honor finite native costs, reject impassable (infinite-cost) candidates and validate
  measurements. Negative incremental costs are unsupported and reported as errors.
- Disable waypoint interpolation for native terrain paths to preserve measured costs.
- Pass snap-derived top-left waypoints, level, dimensions, elevation and action to
  Foundry. Full native shape positioning still needs live verification.
- Region/RegionBehavior create/update/delete events invalidate pending requests only
  for the active scene; movement-action edits also invalidate token request context.
- Preserve ignoreTerrain and legacy fallback when native measurement is unavailable.

Validation: 23 JavaScript tests pass, including a simulated native terrain evaluator
covering expensive/impassable cells, route selection, exact/insufficient budgets,
ignoreTerrain, diagonal history and malformed measurements. Tests also exercise all
six region/behavior invalidation hooks. No token moves or region entry scripts run.

Limitations: native region behavior execution and runtime performance have NOT been
validated in Foundry. Full-prefix measurement costs more than individual edge checks;
profile larger maps before release. Costs must be nonnegative and determined by path
position plus diagonal parity; custom history-dependent cost rules may need additional
search state. Actor/item/effect-derived cost changes during an ongoing request are not
currently tracked. Gridless native terrain, vertical transitions, action-specific wall
restrictions and full footprint clearance remain pending. WASM rebuild remains deferred.

## Batch 8: action-specific movement constraints
- Use Token.constrainMovementPath for native gridded token edges when available.
  Foundry selects the movement action's wall restriction; a generic movement-wall
  precheck no longer incorrectly blocks actions that ignore walls.
- Reject constrained, partial, shifted, wrong-level or wrong-elevation destinations.
  Native errors propagate instead of being treated as a clear path.
- Ignore cost only during edge collision checks; full-prefix terrain measurement
  continues to enforce costs and route budgets separately.
- Share native waypoint conversion between collision and terrain measurement.
  Preserve the existing snap-center convention and pass feet elevation, dimensions,
  depth, shape, level and action consistently.
- Include movement action in graph cache identity. Retain older token collision
  and tokenless movement-source fallbacks.

Validation: all 27 JavaScript tests pass. Four new simulated-native tests cover
walking versus teleportation restrictions, partial/shifted results, error propagation,
rectangular/fractional waypoint conversion and action-specific cache separation.
These tests verify delegation, not Foundry's own collision implementation.

Remaining: live action/door/surface and large-token placement checks, full swept
footprint clearance, vertical routes, gridless native levels/terrain, actor/item/effect
cost invalidation, performance profiling and the deferred WASM rebuild. No live
scene was changed; nothing was deployed or marked as a verified v14 release.

## Batch 9: actor-derived movement invalidation
- Discard pending routes and rebuild caches when an active-scene actor or its owned
  items/effects change. Follow effect parents through items to the owning actor.
- Match synthetic actors by identity/UUID; base actor updates also invalidate tokens
  that inherit that actor's data. Synthetic edits do not match unrelated tokens merely
  because they share a base actor ID.
- Handle ActorDelta create/update/delete on the active scene and token changes to
  actorId, actorLink or delta. Ignore off-scene actors, standalone items and actor
  events while the canvas is not ready.
- Use conservative invalidation for all actor/item/effect fields: system and module
  movement rules can depend on arbitrary data. An unrelated edit to an on-scene actor
  can therefore cancel pending routes too. Callers receive null and may request again.

Validation: all 27 JavaScript tests pass, with the hook suite extended across actor,
item, effect and delta lifecycle events, linked/synthetic identity, nested effects,
off-scene changes and canvas readiness. Syntax and diff checks pass. Actual Foundry
hook ordering and system-derived movement changes still require live validation.
No scene data changed. This batch supersedes the earlier actor-cost invalidation gap;
vertical routing, footprint clearance, gridless native support and WASM/live testing
remain outstanding.

## Batch 10: stable endpoints and early destination validation
- Copy coordinate values into gridded and gridless searches. Mutating a caller's
  coordinate objects no longer moves a queued destination or changes endpoints when
  a wall edit rebuilds a graph. Fractional gridless pixel coordinates remain valid.
- Validate both gridded endpoints before collision graph expansion, using the cache's
  existing integer and canvas bounds checks (including hex dimensions). Previously
  only expanded nodes were checked, so an invalid target could exhaust the whole map.
- Invalid grid endpoints throw a RangeError through blocking calls and reject async
  requests through the existing API error handling. No coordinate clamping is applied.

Validation: 30 JavaScript tests pass, including endpoint mutation across steps/resets,
gridless rebuild coordinates and validation before graph expansion. Existing cache
bounds tests exercise the actual validation rules. Syntax and diff checks pass.
WASM execution and live Foundry/Rideable validation remain pending. This batch does
not implement vertical routing, gridless native terrain or full footprint clearance.

## Batch 11: WASM result ownership
- Copy Rust-backed result points into plain coordinates and release all point wrappers
  before returning a route, including when coordinate reads or cleanup fail.
- Transfer ownership to a replacement search before releasing the old search during
  reset. Cleanup failures no longer lose the replacement or retry a consumed handle.
- Detach search handles before freeing them; repeated free calls do nothing.

Validation: 32 JavaScript tests pass, including wrapper cleanup, failing getters,
cleanup failure isolation and reset ownership. Actual rebuilt bindings still need the
WASM runtime suite; simulated boundaries alone do not establish binary compatibility.
