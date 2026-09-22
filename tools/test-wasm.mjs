// Run after a web-target wasm-pack build:
// node tools/test-wasm.mjs /absolute/path/to/generated/wasm-directory
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
if (!process.argv[2]) throw new Error('Provide the generated WASM directory.');
const directory=resolve(process.argv[2]);
const engine=await import(pathToFileURL(join(directory,'gridless_pathfinding.js')));
await engine.default({module_or_path:await readFile(join(directory,'gridless_pathfinding_bg.wasm'))});
function solve(walls,from,to,budget) {
 const graph=engine.initializeGraph(walls,2,0,false);
 let search;
 try { search=engine.initializePathfinder(from,to,graph,budget); }
 finally { engine.freeGraph(graph); }
 // The search owns its graph reference after the cache releases its handle.
 try {
  for(let i=0;i<100000;i++) {
   const result=engine.step(search);
   if(result===undefined)continue;
   if(result===null)return null;
   try {return {cost:result.cost,path:result.path.map(p=>({x:p.x,y:p.y}))};}
   finally {for(const point of result.path)point.free();}
  }
  throw new Error('WASM search did not terminate');
 } finally {engine.dropPathfinder(search);}
}
const from={x:0,y:0},to={x:3,y:4};
assert.deepEqual(solve([],from,to,5),{cost:5,path:[from,to]});
assert.equal(solve([],from,to,4.999999),null);
assert.equal(solve([],from,from,0).cost,0);
const wall={document:{c:[3,-1,3,3],door:0,ds:0,move:20,flags:{}}};
const end={x:6,y:0};
const detour=solve([wall],from,end,Infinity);
assert.ok(detour&&detour.path.length>2);
const measured=detour.path.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-detour.path[i].x,p.y-detour.path[i].y),0);
assert.ok(Math.abs(detour.cost-measured)<1e-10);
assert.ok(solve([wall],from,end,detour.cost));
assert.equal(solve([wall],from,end,detour.cost-0.000001),null);
console.log('WASM runtime checks passed: budgets, detours, costs, and graph ownership.');
