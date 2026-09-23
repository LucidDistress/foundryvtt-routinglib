import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=name=>readFile(new URL('../js/'+name,import.meta.url),'utf8');
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
let code=await read('native-gridless.js');
code=code.replace('import {stepCollidesWithWall} from "./cache.js";', 'const stepCollidesWithWall=(...args)=>globalThis.__nativeCollision(...args);');
const util=(await read('util.js')).replace('./foundry_fixes.js',url(await read('foundry_fixes.js')));
code=code.replace('./util.js',url(util));
for(const name of ['data_structures.js','movement_cost.js'])code=code.replace('./'+name,url(await read(name)));
const {NativeGridlessPathfinder}=await import(url(code));
globalThis.CONST={GRID_TYPES:{GRIDLESS:0}};
globalThis.PIXI={Point:class{constructor(x,y){this.x=x;this.y=y;}}};
const from={x:10,y:50},to={x:90,y:50};
const wall={a:{x:50,y:30},b:{x:50,y:70},move:20};
function crosses(a,b){
 if((a.x<50&&b.x<50)||(a.x>50&&b.x>50)||a.x===b.x)return false;
 const t=(50-a.x)/(b.x-a.x),y=a.y+t*(b.y-a.y);
 return t>=0&&t<=1&&y>=30&&y<=70;
}
function setup(edges=[]){
 globalThis.canvas={grid:{type:0,size:20},dimensions:{distance:5,rect:{contains:(x,y)=>x>=0&&y>=0&&x<100&&y<100}},
  scene:{levels:new Map([['ground',{edges:{getEdges:()=>edges}}],['upper',{edges:{getEdges:()=>[]}}]]),regions:[]}};
 globalThis.game={settings:{get:()=>1}};
 globalThis.CONFIG={Token:{movement:{actions:{walk:{walls:'move'},teleport:{walls:null}}}}};
 globalThis.__nativeCollision=(a,b,d)=>d.level==='ground'&&d.action!=='teleport'&&edges.length>0&&crosses(a,b);
 const token={document:{getMovementOrigin:()=>({x:10,y:10})},
  createTerrainMovementPath:(path,options)=>{assert.equal(options.preview,false);return path;},
  measureMovementPath:path=>({cost:path.slice(1).reduce((cost,b,i)=>cost+Math.hypot(b.x-path[i].x,b.y-path[i].y)*.25,0)})};
 return {width:1,height:1,elevation:0,depth:1,shape:0,level:'ground',action:'walk',token};
}
function run(data,options={},a=from,b=to){
 const p=new NativeGridlessPathfinder(a,b,data,options);
 try{
  for(let i=0;i<100000;i++){
   const n=p.step();if(n!==undefined)return n===null?null:p.postProcessResult(n);
  }
  throw new Error('native gridless did not finish');
 }finally{p.free();}
}
test('native gridless routes detour around walls and enforce exact pixel/scene budgets',()=>{
 const data=setup([wall]),route=run(data);
 assert.ok(route.path.length>2);assert.deepEqual(route.path[0],from);assert.deepEqual(route.path.at(-1),to);
 for(let i=1;i<route.path.length;i++)assert.equal(crosses(route.path[i-1],route.path[i]),false);
 assert.ok(route.cost>80);assert.ok(run(data,{maxDistance:route.cost}));
 assert.equal(run(data,{maxDistance:route.cost-.001}),null);
 assert.ok(Math.abs(run(data,{gridlessDistanceUnits:'scene'}).cost-route.cost*.25)<1e-9);
});
test('native gridless respects level and action isolation and directional collision',()=>{
 const data=setup([wall]);
 assert.equal(run({...data,level:'upper'}).cost,80);
 assert.equal(run({...data,action:'teleport'}).cost,80);
 globalThis.__nativeCollision=(a,b)=>a.x<b.x&&crosses(a,b);
 assert.ok(run(data).cost>80);assert.equal(run(data,{},to,from).cost,80);
 assert.throws(()=>run({...data,level:'missing'}),/level/);
});
test('native gridless routes around impassable terrain without walls and honors ignoreTerrain',()=>{
 const data=setup();
 canvas.scene.regions=[{hidden:false,polygons:[{points:[40,30,60,30,60,70,40,70]}]}];
 const measure=data.token.measureMovementPath;
 data.token.measureMovementPath=path=>{
  for(let i=1;i<path.length;i++){
   // Convert native top-left waypoints back to route centers for the test region.
   const a={x:path[i-1].x+10,y:path[i-1].y+10},b={x:path[i].x+10,y:path[i].y+10};
   if(crosses(a,b))return {cost:Infinity};
  }
  return measure(path);
 };
 assert.ok(run(data).cost>80);assert.equal(run(data,{ignoreTerrain:true}).cost,80);
 data.token.measureMovementPath=()=>({cost:NaN});
 assert.throws(()=>run(data),/invalid movement measurement/);
});
test('native gridless resets rebuild geometry while retaining request endpoints',()=>{
 const edges=[],data=setup(edges),a={...from},b={...to};
 const p=new NativeGridlessPathfinder(a,b,data,{});
 a.x=999;b.y=999;edges.push(wall);p.reset();
 let result;
 for(let i=0;i<100000;i++){const n=p.step();if(n!==undefined){result=n===null?null:p.postProcessResult(n);break;}}
 assert.ok(result.cost>80);assert.deepEqual(result.path[0],from);assert.deepEqual(result.path.at(-1),to);
 p.free();
});
test('native gridless supports tokenless geometry and rejects invalid configuration',()=>{
 const data=setup([wall]);delete data.token;
 assert.ok(run(data).cost>80);
 assert.equal(run(data,{},from,from).cost,0);
 assert.throws(()=>run(data,{},from,{x:100,y:50}),/inside the canvas/);
 assert.throws(()=>run(data,{gridlessDistanceUnits:'feet'}),/pixels or scene/);
 game.settings.get=()=>NaN;assert.throws(()=>run(data),/ratio|Ratio/);
});

test('native gridless never returns a full route rejected by native constraints',()=>{
 const data=setup([wall]);
 data.token.constrainMovementPath=p=>[p,true];
 assert.equal(run(data),null);
 data.token.constrainMovementPath=p=>[p,false];
 assert.ok(run(data));
});
