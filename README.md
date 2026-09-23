# routinglib
Routinglib is a library module that offers pathfinding capabilities to other modules. The code for this library was initially written for the [Drag Ruler module](https://foundryvtt.com/packages/drag-ruler) and has been extracted into a library to open up the opportunity of using pathfinding to all modules.

## Should I install this module?
This module does not provide any user-facing features on it's own. Only install this module either if another module you're using has declared this module as a dependency or if another module you're using indicates that it will unlock specific features if routinglib is installed. If neihter of those apply to you, there is nothing to gain by installing routinglib.

## V14 test build

This fork's `1.2.0-beta.1` targets Foundry v14. It is ready for controlled integration
testing, not yet declared `verified`. Download a successful **Validate routinglib**
workflow artifact from this fork and follow [TESTING-V14.md](TESTING-V14.md).
No release/update URL is advertised until a fork release is published; this prevents
an update from silently replacing the fork with the old upstream package.

## Capabilities

| Mode | Collision and cost handling | Limits |
|---|---|---|
| Square/hex token routes | Native level, action, wall and terrain APIs; scene diagonal rules | Grid anchors; same elevation and level; custom history-dependent costs unsupported |
| V14 gridless token routes | Native directed collision and full-route terrain costs; candidates around walls and regions | Approximate continuous paths; large scenes need performance testing |
| Tokenless routes | Native level wall checks; geometric costs | No token-specific action or terrain costs |

No mode plans vertical transitions or adds a swept-footprint clearance guarantee
beyond Foundry's own collision rules. Planning never moves tokens or executes region
entry scripts. See the test guide for large-token and Rideable checks.

## Using routinglib in a module
*This section is intended for module authors that would like to integrate routinglib's pathfinding capabilities into their modules. If you aren't a module author, you can stop reading here*

### Knowing when routinglib is ready
Before routinglib can perform any pathfinding operations, it needs to perform some initialization steps, that can only be performed once all of routinglib's resources have loaded and Foundry's canvas is ready. To make it easy to determine when you can start requesting routing calculations, routinglib will fire the `routinglib.ready` hook. You can receive the hook like this:

```javascript
Hooks.on("routinglib.ready", function () {
   // You can start issuing pathfinding commands now
});
```

### The coordinate system used by routinglib
Whenever routinglib expects a coordinate as a parameter or returns coordinates in a result, the coordinates will be in the format specified in this section. Each coordinate is an object that contains a `x`and a `y` attribute. Those attibutes are given as follows:

- On *gridded* scenes (square and hex), `x` and `y` will be given as grid cells.
- On *gridless* scenes, `x` and `y` will be given in pixels.

### Calculating a path
You can ask routinglib to calculate a path by invoking

```javascript
routinglib.calculatePath(from, to, options)
```

This function will initiate a pathfinding calculation. Because this calculation can take a non-negligible amount of time - depending on the complexity of the active scene - the calculation is performed asynchronously in the background. The function will return a promise, that yields information about the calculated path.

The parameters of this fuction are:
- **from** is a [coordinate](#the-coordinate-system-used-by-routinglib) indicating the start point of the route
- **to** is a [coordinate](#the-coordinate-system-used-by-routinglib) indicating the end point of the route
- **options** *(optional)* is an object that can contain several properties to fine-tune the behavior of routinglib. See below for a [list of possible options](#options)

The function will return a promise. If no path is found, the promise will resolve to `null`. If a path is found, the promise will resolve to an object containing two properties:
- **path** an array of [coordinates](#the-coordinate-system-used-by-routinglib) that represent the waypoints of the calculated path. This path includes the start and end point passed into the parameters.
- **cost** indicates the length of the path. If difficult terrain was considered during the pathfinding operation, this cost will include cost incurred by walking over difficult terrain.

#### Options
- **token** If the route requested from routinglib is supposed to be walked by a specific token, pass that token via the *token* option. This allows routinglib to take token-specific properties like token size, token elevation and more into account.
- **ignoreTerrain** *default: false* Set this option to `true` if you'd like routinglib to ignore terrain for the requested route.
- **elevation** This parameter allows specifying an elevation at which the routing should be performed. If this parameter is set, the elevation of the token passed into the *token* option is being ignored.
- **maxDistance** will limit the routing algorithm to paths that have at most the length indicated by this parameter. If a path cannot be found within the specified distance, the function's promise will resolve to *null*. Specifying this option will cause the routing algorithm to finish faster because it doesn't need to consider all the available routes.

#### Options exclusive to the gridded pathfinder
- **interpolate** *default: ture* If this option is set to `true` the pathfinder will try to emit as little waypoints as possible. If it's set to `false`, the pathfinder will emit a waypoint for every grid cell that the path passes trough.

#### Cancelling a running pathfinding operation
If for you no longer need the path you've requested, you should cancel the pathfinding operation. This improves the overall performance of your module - especially if you're scheduling many pathfinding operations in rapid succession. A running pathfinding operation can be cancelled by calling

```javascript
routinglib.cancelPathfinding(promise)
```

The **promise** parameter expects the promise of the pathfinding operation that you'd like to cancel. The promise expected here is the promise that was returned by the `calculatePath` function.

After you've cancelled a pathfinding operation, the promise belonging to that pathfinding request will become invalid and will never resolve and should thus be discarded.

### Blocking path calculation
**Using the function documented in this section can cause Foundry to freeze for considerable amounts of time when used on complex scenes. Only use this function if you there's no way around it.** If possible at all, please use [the async function](#calculating-a-path) instead.

If you absolutely cannot use an async function, routinglib offers a blocking alternative.

```javascript
routinglib.calculatePathBlocking(from, to, options)
```

The function will behave exactly the same as [the async function](#calculating-a-path) (see it's documentation for details), with the following exceptions:
- This function will not perform the path calculation in the background. Instead, it will cause Foundry to freeze until either a path is found or the routing algorithm can guarantee that no path exists.
- This function will not return a promise. Instead, it will directly return either *null* or the result object.
- To call this function, you must specify the *maxDistance* option. This is a safeguard to reduce Foundry freezes to a minimum. If the *maxDistance* option is not specified, the function will not perform any calculations, but will abort with an exception.

## Building routinglib
Since this module contains WebAssembly components written in rust, building a release of this module isn't as trivial as just packaging up the contents of this folder. To aid the process of developing and releasing routinglib, a few helper scripts are included in the repository.

### Setting up a basic development environment
If you're either planning to build the WebAssembly components to start writing code to contribute to this module, or if you want to build a custom release of routinglib, you'll need a rust development environment für WebAssembly in both cases. First, you need to install a rust compiler. The rust installer `rustup` and instructions on how to install rust can be found on (https://rustup.rs/).

Once rust is installed, you need several components that allow you to build WebAssembly from Rust code. If you're on a Unix-Like system, you can simply execute the script `install_dev_dependencies.sh`, which will take care of installing those for you. Alternatively, if you're on Windows, you can run the commands listed in the shell file manually to install those components.

You're now ready to build routinglib.

### Building a custom release
To build a custom release, simply execute the Python script `build_release.py`. The script will take care of building the rust code in a Release configuration to WebAssembly and will package all the necessary files into a zip file that can be installed in Foundry VTT. After the script has finished, the zip file can be found in the folder `artifact`.

### Building the WebAssembly component for development purposes
If you're interested in modifying routinglib, you'll need to pouplate your working directory with the required WebAssembly files. To do this, execute `./build_wasm.py --debug`. This script will build the rust code and will store the resulting WebAssembly into the `wasm/` folder, which is the location foundry expects them to be in when it tries to load those components. The pyton script will remain active after the build has finished and will watch for changes in the Rust code. If the Rust code is modified, the script will automatically re-build the WebAssembly, to ensure you're always testing with the most up-to-date code as possible.



### Movement-distance compatibility (development)

Square-grid routing follows the scene's diagonal rule, including exact, approximate,
rectilinear, both alternating sequences, and prohibited diagonals. Fractional costs
are retained. Each search starts with zero prior diagonals; movement already spent
before the request is not included. Interpolation only removes collinear square-grid
waypoints, preserving turns and movement costs. Terrain routes and hex routes retain
all waypoints for correctness.

Gridless coordinates always remain pixels. For compatibility, gridless `cost` and
`maxDistance` still default to pixels. Pass `gridlessDistanceUnits: "scene"` to express
both in the scene's distance units (such as feet), matching gridded routing:

```js
await routinglib.calculatePath(startPixel, endPixel, {
  token,
  maxDistance: 30,
  gridlessDistanceUnits: "scene"
});
```

`gridlessDistanceUnits: "pixels"` explicitly requests legacy behavior. This option
only applies to gridless scenes. The Rust source now uses geometric distance without a per-edge penalty. Rebuild
the WASM assets to include this fix; an older binary retains its previous behavior.

### Optional gridless engine

After `routinglib.ready`, call `routinglib.isGridlessAvailable()` to check whether
a gridless engine is available for the current scene. V14 uses the native JavaScript
graph and does not need WASM. Legacy scenes require WASM; if it fails to load, their
gridless requests fail explicitly while gridded routing remains available. Install a complete release
and reload Foundry to restore gridless support. `calculatePath` reports invalid
requests as rejected promises; `calculatePathBlocking` throws synchronously.

### Native levels and wall checks (development)

On v14, gridded token queries use the token's own level and native movement height.
Tokenless queries default to the viewed level; pass `level: "levelDocumentId"` to
select a different level in the active scene. A token query cannot override its
level. Missing levels and collision backend failures are reported as errors.
Relevant token dimension/elevation/level edits and native level changes invalidate
pending requests with `null`, allowing callers to request a new route.

These are same-level wall checks. Native terrain costs are integrated for gridded token routes (see below). Vertical
travel and extra footprint clearance remain outside this two-dimensional API. V14
gridless routing uses native levels and movement rules as well.

### Rust and WASM validation

Run native engine regressions with `cargo test --locked --manifest-path rust/Cargo.toml`.
Build release assets with `python build_release.py` (Rust and wasm-pack required).
The release build uses the committed Cargo lockfile.
After extracting the resulting archive, run `node tools/test-wasm.mjs <module/wasm>`
to test the generated bindings and binary. This is separate from the JavaScript
suite, which uses simulated WASM boundaries.

### Native terrain measurement (development)

Token-based searches use v14's native terrain-path and movement measurement
APIs when available. Reported `cost` and `maxDistance` include native movement costs;
regions represented by infinite movement cost are impassable. The full candidate
route is measured to preserve alternating-diagonal history. Native terrain routes
retain their waypoints even with interpolation enabled.

`ignoreTerrain: true` bypasses terrain measurement. Tokenless requests do not use native terrain costs. V14 gridless token requests also
use native measurement, through their native visibility graph. Region and RegionBehavior edits invalidate pending
requests with `null`; callers can request a new route. Planning does not move tokens
or execute region-entry scripts. Live Foundry correctness/performance testing remains
required, particularly for large tokens and custom movement actions/cost rules.

### Request lifetime

Coordinates are copied at request creation. Changes to active-scene levels, regions,
token movement context, or on-scene actors/items/effects can resolve pending requests
with `null`; request again after the change. Explicit successful cancellation retains
the historical unresolved-promise behavior. Errors reject asynchronous calls and throw
from blocking calls. Grid coordinates must be integer cells inside the canvas; gridless
coordinates are center points in pixels.
