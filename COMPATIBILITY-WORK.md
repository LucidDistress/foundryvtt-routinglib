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
- Integrate native v14 movement levels, region restrictions/costs, and token shapes.
  Current collision changes only modernize the source constructor; they do not
  establish v14 movement compatibility.
- Review all diagonal modes and alternating-diagonal search state/heuristic.
- Correct gridless pixel-versus-scene-unit distance semantics with compatibility tests.
- Test hex token sizes/orientations, narrow passages, one-way walls, doors,
  scene switching, and Rideable in Foundry.
- Validate cache identity for different token sizes, elevation, and native levels.
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
