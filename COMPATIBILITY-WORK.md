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
- Integrate region restrictions/costs and token footprints; gridded wall checks now
  delegate to native token collision with level and movement-height context.
  This does not yet establish full v14 movement compatibility.
- Verify diagonal rules in Foundry after the isolated distance regression suite.
- Rebuild/fix Rust gridless exact-boundary costs; scene-unit conversion is implemented as an opt-in compatibility option.
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
