import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const read=name=>readFile(new URL('../js/'+name,import.meta.url),'utf8');
const dependency=async name=>name==='util.js'?(await read(name)).replace('./foundry_fixes.js',url(await read('foundry_fixes.js'))):read(name);
globalThis.CONST={GRID_TYPES:{GRIDLESS:0,SQUARE:1},GRID_DIAGONALS:{EQUIDISTANT:0,EXACT:1,APPROXIMATE:2,RECTILINEAR:3,ALTERNATING_1:4,ALTERNATING_2:5,ILLEGAL:6}};
globalThis.window={};
globalThis.canvas={grid:{type:1,size:100,sizeX:100,sizeY:100},scene:{grid:{type:1},dimensions:{distance:5}},dimensions:{width:800,height:800,distance:5}};
let nodes;
globalThis.__distanceCache={getInitializedNode:({x,y})=>nodes.get(`${x},${y}`)};
const calls=[];
globalThis.__distanceWasm={initializePathfinder:(from,to,graph,max)=>{calls.push({from,to,graph,max});return calls.length;},dropPathfinder:h=>calls.push({drop:h}),resetPathfinder:h=>calls.push({reset:h})};
let code=await read('pathfinder.js');
code=code.replace('import {cache, stepCollidesWithWall} from "./cache.js";','const cache=globalThis.__distanceCache; const stepCollidesWithWall=()=>false;');
for(const name of ['movement_cost.js','data_structures.js','foundry_fixes.js','util.js'])code=code.replace('./'+name,url(await dependency(name)));
code=code.replace('import * as GridlessPathfinding from "./gridless.js";','const GridlessPathfinding=globalThis.__distanceWasm;');
const {GriddedPathfinder,GridlessPathfinder}=await import(url(code));
function board(blocked=new Set()) {
 nodes=new Map();
 for(let y=0;y<5;y++)for(let x=0;x<5;x++)if(!blocked.has(`${x},${y}`))nodes.set(`${x},${y}`,{x,y,neighbors:[]});
 for(const n of nodes.values())for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
  if(!dx&&!dy)continue; const other=nodes.get(`${n.x+dx},${n.y+dy}`);
  if(other)n.neighbors.push({x:other.x,y:other.y,isDiagonal:!!(dx&&dy)});
 }
}
function solve(rule,from,to,budget=Infinity,interpolate=false) {
 canvas.grid.diagonals=rule;
 const p=new GriddedPathfinder(0,0,from,to,null,{width:1,height:1},{maxDistance:budget,interpolate});
 for(let i=0;i<10000;i++){const n=p.step();if(n!==undefined)return n===null?null:p.postProcessResult(n);}
 throw new Error('search failed to terminate');
}
// Independent reference: exhaustive relaxation over (square, diagonal parity),
// with explicit costs; no production queue, heuristic or cost helper is used.
function reference(rule,from,to) {
 const d=new Map([[`${from.x},${from.y},0`,0]]);
 for(let pass=0;pass<100;pass++) {
  let changed=false;
  for(const [key,cost] of [...d]) {
   const [x,y,p]=key.split(',').map(Number);
   for(const n of nodes.get(`${x},${y}`).neighbors) {
    let step=1,parity=p;
    if(n.isDiagonal){step=[1,Math.SQRT2,1.5,2,p?2:1,p?1:2,Infinity][rule];if(rule===4||rule===5)parity=1-p;}
    const next=`${n.x},${n.y},${parity}`,value=cost+step;
    if(value<(d.get(next)??Infinity)){d.set(next,value);changed=true;}
   }
  }
  if(!changed)break;
 }
 return Math.min(d.get(`${to.x},${to.y},0`)??Infinity,d.get(`${to.x},${to.y},1`)??Infinity)*5;
}
test('all seven diagonal rules match independent shortest paths on obstructed grids',()=>{
 let seed=847;
 const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2**32;};
 for(let trial=0;trial<40;trial++) {
  const blocked=new Set();for(let y=0;y<5;y++)for(let x=0;x<5;x++)if(random()<0.27)blocked.add(`${x},${y}`);
  blocked.delete('0,0');blocked.delete('4,4');board(blocked);
  for(let rule=0;rule<=6;rule++) {
   const expected=reference(rule,{x:0,y:0},{x:4,y:4});
   const result=solve(rule,{x:0,y:0},{x:4,y:4});
   if(!Number.isFinite(expected)){assert.equal(result,null);continue;}
   assert.ok(Math.abs(result.cost-expected)<1e-9,`rule=${rule}, trial=${trial}`);
   assert.ok(solve(rule,{x:0,y:0},{x:4,y:4},expected));
   assert.equal(solve(rule,{x:0,y:0},{x:4,y:4},expected-0.001),null);
  }
 }
});
test('fractional costs, alternating sequences, and zero-distance paths',()=>{
 board();
 const start={x:0,y:0},one={x:1,y:1},three={x:3,y:3};
 assert.equal(solve(2,start,one).cost,7.5);
 assert.equal(solve(2,start,one,7.49),null);
 assert.equal(solve(4,start,three).cost,20);
 assert.equal(solve(5,start,three).cost,25);
 assert.equal(solve(5,start,one,5),null);
 assert.deepEqual(solve(0,start,start,0),{path:[start],cost:0});
});
test('interpolation cannot turn orthogonal-only routes into diagonals',()=>{
 board(); const result=solve(6,{x:0,y:0},{x:4,y:4},40,true);
 for(let i=1;i<result.path.length;i++)assert.ok(result.path[i].x===result.path[i-1].x||result.path[i].y===result.path[i-1].y);
 assert.equal(result.cost,40);
});
test('gridless scene units convert budgets and costs, retain pixel coordinates on resets',()=>{
 calls.length=0;
 const from={x:10,y:20},to={x:110,y:20};
 const p=new GridlessPathfinder('old',from,to,{maxDistance:5,gridlessDistanceUnits:'scene'},()=> 'new');
 assert.equal(calls[0].max,100);assert.equal(calls[0].from,from);
 assert.deepEqual(p.postProcessResult({path:[from,to],cost:100}),{path:[from,to],cost:5});
 p.reset();assert.equal(calls[1].max,100);assert.equal(calls[1].graph,'new');
 const legacy=new GridlessPathfinder('g',from,to,{maxDistance:5});
 assert.equal(calls.at(-1).max,5);assert.equal(legacy.postProcessResult({cost:100}).cost,100);
 assert.throws(()=>new GridlessPathfinder('g',from,to,{gridlessDistanceUnits:'feet'}),RangeError);
});


test('native terrain routes avoid expensive and impassable cells, preserving full-prefix cost',()=>{
 board();canvas.scene.levels=new Map();canvas.grid.diagonals=0;
 canvas.grid.getTopLeftPoint=({i,j,x,y})=>i!==undefined?{x:j*100,y:i*100}:{x:Math.floor(x/100)*100,y:Math.floor(y/100)*100};
 canvas.grid.getCenterPoint=({x,y})=>({x:Math.floor(x/100)*100+50,y:Math.floor(y/100)*100+50});
 globalThis.PIXI={Point:class{constructor(x,y){this.x=x;this.y=y;}}};
 let calls=0,maxPrefix=0,mode='terrain';
 const token={document:{getMovementOrigin:()=>({x:50,y:50,elevation:0})},
  createTerrainMovementPath:(waypoints,options)=>{assert.equal(options.preview,false);calls++;maxPrefix=Math.max(maxPrefix,waypoints.length);return waypoints.map(w=>({...w,terrain:{test:true}}));},
  measureMovementPath:(waypoints,options)=>{
   assert.equal(options.preview,false);let cost=0,diagonals=0;
   for(let i=1;i<waypoints.length;i++){
    const a=waypoints[i-1],b=waypoints[i];assert.ok(b.terrain.test);
    assert.equal(b.level,'ground');assert.equal(b.action,'walk');
    const diagonal=a.x!==b.x&&a.y!==b.y;
    if(diagonal)diagonals++;
    let step=mode==='alternating'&&diagonal?(diagonals%2?5:10):5;
    if(mode==='terrain'&&b.y===200&&b.x>0&&b.x<400)step=b.x===200?Infinity:40;
    cost+=step;
   }
   return {cost,diagonals};
  }};
 const data={width:1,height:1,depth:0,shape:0,elevation:0,level:'ground',action:'walk'};
 function run(from,to,maxDistance=Infinity,ignoreTerrain=false){
  const p=new GriddedPathfinder(0,0,from,to,token,data,{maxDistance,ignoreTerrain,interpolate:true});
  for(let i=0;i<1000;i++){const n=p.step();if(n!==undefined)return n===null?null:p.postProcessResult(n);}
  throw new Error('native search did not finish');
 }
 const from={x:0,y:2},to={x:4,y:2};
 const result=run(from,to,20);assert.equal(result.cost,20);
 assert.ok(result.path.every(p=>p.y!==2||p.x===0||p.x===4));
 assert.ok(maxPrefix>=5);assert.equal(run(from,to,19.999),null);
 const before=calls;assert.equal(run(from,to,20,true).cost,20);assert.equal(calls,before);
 mode='alternating';canvas.grid.diagonals=4;
 assert.equal(run({x:0,y:0},{x:3,y:3},20).cost,20);
 assert.equal(run({x:0,y:0},{x:3,y:3},19.999),null);
 token.measureMovementPath=()=>({cost:NaN,diagonals:0});
 assert.throws(()=>run(from,to),/invalid movement measurement/);
 delete canvas.scene.levels;
});
