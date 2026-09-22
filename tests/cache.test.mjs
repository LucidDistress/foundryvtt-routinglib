import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const counts={reset:0,created:[],freed:[],collision:0};
globalThis.__cacheCounts=counts;
globalThis.CONST={GRID_TYPES:{GRIDLESS:0,SQUARE:1}};
let ratio=.9;
globalThis.game={settings:{get:()=>ratio},modules:new Map()};
globalThis.canvas={ready:true,grid:{type:1,size:100,sizeX:100,sizeY:100,
 getAdjacentOffsets:({i,j})=>[{i,j:j+1},{i:i+1,j}]},dimensions:{width:1000,height:1000},walls:{placeables:[]}};
let code=await readFile(new URL('../js/cache.js',import.meta.url),'utf8');
code=code.replace('import {resetJobs} from "./background.js";','const resetJobs=()=>globalThis.__cacheCounts.reset++;');
code=code.replace('import {getPixelsFromGridPositionObj} from "./foundry_fixes.js";','const getPixelsFromGridPositionObj=p=>p;');
code=code.replace('import {getSnapPointForTokenDataObj, getNativeMovementWaypoint, isModuleActive} from "./util.js";','const getSnapPointForTokenDataObj=p=>p; const isModuleActive=()=>false;');
code=code.replace('import * as GridlessPathfinding from "./gridless.js";',`const GridlessPathfinding={initializeGraph:(...args)=>{const c=globalThis.__cacheCounts;c.created.push(args);return c.created.length;},freeGraph:g=>globalThis.__cacheCounts.freed.push(g)};`);
// Keep actual cache construction, keys, adjacency and reset/disposal code; inject a
// deterministic collision oracle which changes at an exact elevation boundary.
code=code.slice(0,code.indexOf('export function stepCollidesWithWall'))+`export function stepCollidesWithWall(from,to,data){globalThis.__cacheCounts.collision++;return data.elevation===10;}`;
const cacheModule=await import(url(code));
function token(overrides={}){return {width:1,height:1,elevation:0,...overrides};}
function node(cache,data,pos={x:2,y:3}){return cache.getInitializedNode(pos,3,1,data);}

test('different sizes, exact elevations and hex snapping cannot share cached nodes',()=>{
 const cache=new cacheModule.GriddedCache();
 const first=node(cache,token());
 assert.equal(node(cache,token()),first);
 const a={},b={};assert.notEqual(node(cache,token({token:a})),node(cache,token({token:b})));
 assert.equal(node(cache,token({token:a})),node(cache,token({token:a})));
 for(const data of [token({width:3,height:3}),token({width:.5,height:.5}),token({elevation:5}),token({altOrientation:true}),token({level:"upper"}),token({depth:2}),token({shape:1}),token({token:{}}),token({hexSizeSupport:{altSnappingFlag:true,borderSize:2}})])assert.notEqual(node(cache,data),first);
 assert.equal(node(cache,token({elevation:10})).neighbors.length,0);
 assert.equal(node(cache,token({elevation:10.001})).neighbors.length,2);
 assert.equal(node(cache,token({elevation:9.999})).neighbors.length,2);
});
test('cache uses exact finite elevations and validates coordinate bounds',()=>{
 const cache=new cacheModule.GriddedCache();
 for(const z of [-20,0,5,20,100])assert.equal(cache.getLevelIndexForElevation(z),z);
 for(const z of [NaN,Infinity,-Infinity])assert.throws(()=>cache.getLevelIndexForElevation(z),RangeError);
 for(const p of [{x:-1,y:0},{x:10,y:0},{x:0,y:10},{x:.5,y:1}])assert.throws(()=>node(cache,token(),p),RangeError);
 assert.equal(node(cache,token(),{x:9,y:9}).neighbors.length,0);
});
test('wall invalidation replaces nodes and resets pending jobs',()=>{
 cacheModule.initializeCaches();
 const first=node(cacheModule.cache,token());const resets=counts.reset;
 cacheModule.wipeCaches();
 assert.notEqual(node(cacheModule.cache,token()),first);assert.equal(counts.reset,resets+1);
 cacheModule.disposeCaches();cacheModule.wipeCaches();assert.equal(counts.reset,resets+1);
});
test('gridless graphs separate exact elevations and ratios and free each handle once',()=>{
 canvas.grid.type=0;counts.freed.length=0;counts.created.length=0;
 cacheModule.initializeCaches();const c=cacheModule.cache;
 const a=c.getGraphFor(1,1,10);
 assert.equal(c.getGraphFor(1,1,10),a);
 assert.notEqual(c.getGraphFor(1,1,10.001),a);
 assert.notEqual(c.getGraphFor(3,1,10),a);
 ratio=.8;assert.notEqual(c.getGraphFor(1,1,10),a);
 assert.equal(counts.created.length,4);
 c.reset();assert.equal(counts.freed.length,4);assert.equal(new Set(counts.freed).size,4);
 c.getGraphFor(1,1,10);cacheModule.disposeCaches();cacheModule.disposeCaches();
 assert.equal(counts.freed.length,5);assert.equal(new Set(counts.freed).size,5);
 canvas.ready=false;cacheModule.initializeCaches();assert.equal(cacheModule.cache,undefined);
});
