import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=name=>readFile(new URL('../js/'+name,import.meta.url),'utf8');
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');

test('optional engine initializes once and delegates all WASM operations',async()=>{
 const calls=[];
 globalThis.__engine={default:async()=>calls.push('init')};
 for(const key of ['initializeGraph','freeGraph','initializePathfinder','resetPathfinder','dropPathfinder','step'])globalThis.__engine[key]=(...args)=>{calls.push([key,...args]);return 17;};
 const code=(await read('gridless.js')).replace('import("../wasm/gridless_pathfinding.js")','Promise.resolve(globalThis.__engine)');
 const engine=await import(url(code));
 assert.equal(engine.default(),engine.default());await engine.default();
 assert.equal(calls.filter(x=>x==='init').length,1);
 for(const key of ['initializeGraph','freeGraph','initializePathfinder','resetPathfinder','dropPathfinder','step'])assert.equal(engine[key](1,2),17);
 assert.deepEqual(calls.at(-1),['step',1,2]);
});
test('failed optional engine exposes a useful error without statically importing assets',async()=>{
 const code=(await read('gridless.js')).replace('import("../wasm/gridless_pathfinding.js")','Promise.reject(new Error("missing binary"))');
 const engine=await import(url(code));
 await assert.rejects(engine.default(),/missing binary/);
 assert.throws(()=>engine.initializeGraph(),error=>/gridless engine is unavailable/.test(error.message)&&error.cause.message==='missing binary');
});

test('startup publishes gridded API once on WASM failure and handles teardown and rejected input',async()=>{
 const once=new Map(),hooks=new Map(),state={ready:0,cleared:0,scheduled:0};
 globalThis.__startupState=state;
 globalThis.Hooks={once:(k,f)=>once.set(k,f),on:(k,f)=>hooks.set(k,f),callAll:()=>state.ready++};
 globalThis.CONST={GRID_TYPES:{GRIDLESS:0,SQUARE:1}};
 globalThis.canvas={ready:true,scene:{id:'scene'},grid:{type:1}};
 globalThis.window={};
 const originalWarn=console.warn;console.warn=()=>{};
 try {
  let code=(await read('main.js')).replace(/^import .*;$/gm,'');
  code=`const s=globalThis.__startupState;
  const initializeBackground=()=>{},createAsyncPathfinder=()=>{s.scheduled++;return Promise.resolve({cost:5});},cancelJob=()=>false,invalidateJobs=()=>s.cleared++;
  const cache={getLevelIndexForElevation:e=>e},GriddedCache={getSnapPointIndexForTokenData:()=>0},initializeCaches=()=>{},wipeCaches=()=>{},disposeCaches=()=>{};
  const GriddedPathfinder=class{},GridlessPathfinder=class{},initGridlessPathfinding=()=>Promise.reject(new Error('missing wasm'));
  const getAltOrientationFlagForToken=()=>false,getHexTokenSize=()=>1,isModuleActive=()=>false;
  `+code;
  await import(url(code));await once.get('ready')();await new Promise(resolve=>setImmediate(resolve));
  await once.get('ready')();assert.equal(state.ready,1);
  const api=window.routinglib;assert.equal(api.isGridlessAvailable(),false);
  assert.deepEqual(await api.calculatePath({x:0,y:0},{x:1,y:0}),{cost:5});
  let promise;assert.doesNotThrow(()=>{promise=api.calculatePath({x:NaN,y:0},{x:1,y:0});});
  await assert.rejects(promise,/finite numbers/);
  canvas.grid.type=0;await assert.rejects(api.calculatePath({x:0,y:0},{x:1,y:0}),/gridless engine is unavailable/);
  canvas.ready=false;hooks.get('canvasTearDown')();assert.equal(state.cleared,1);
  await assert.rejects(api.calculatePath({x:0,y:0},{x:1,y:0}),/ready scene/);
  assert.equal(state.scheduled,1);
 } finally {console.warn=originalWarn;}
});
