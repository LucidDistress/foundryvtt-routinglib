import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=name=>readFile(new URL('../js/'+name,import.meta.url),'utf8');
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const coordinates=url(await read('foundry_fixes.js'));
const utility=url((await read('util.js')).replace('./foundry_fixes.js',coordinates));
let code=await read('cache.js');
code=code.replace('import {resetJobs} from "./background.js";','const resetJobs=()=>{};');
code=code.replace('./foundry_fixes.js',coordinates).replace('./util.js',utility);
code=code.replace('import * as GridlessPathfinding from "./gridless.js";','const GridlessPathfinding={};');
const {stepCollidesWithWall:collides,GriddedCache}=await import(url(code));
const {getNativeMovementWaypoint,nativeRouteIsComplete}=await import(utility);
globalThis.CONST={GRID_TYPES:{GRIDLESS:0,SQUARE:1}};
globalThis.PIXI={Point:class{constructor(x,y){this.x=x;this.y=y;}}};
globalThis.canvas={scene:{levels:new Map([['ground',{id:'ground'}]])},grid:{type:1,size:100,sizeX:100,sizeY:100,
 getTopLeftPoint:({i,j,x,y})=>i!==undefined?{x:j*100,y:i*100}:{x:Math.floor(x/100)*100,y:Math.floor(y/100)*100},
 getCenterPoint:({x,y})=>({x:Math.floor(x/100)*100+50,y:Math.floor(y/100)*100+50}),
 getAdjacentOffsets:({i,j})=>[{i,j:j+1}]},dimensions:{width:1000,height:1000}};
function fixture(overrides={}){
 const t={document:{_source:{level:'ground'},getMovementOrigin:({x,y,elevation,width,height,depth})=>({x:x+width*50,y:y+height*50,elevation:elevation+depth*2.5})},
 checkCollision(){throw new Error('generic collision must not run');},constrainMovementPath:path=>[path,false]};
 return {token:t,width:1,height:1,depth:1,shape:0,elevation:10,level:'ground',action:'walk',...overrides};
}
test('native action decides collision and receives constraint-only options',()=>{
 const d=fixture();let seen;
 d.token.constrainMovementPath=(path,options)=>{seen={path,options};return path[1].action==='teleport'?[path,false]:[[path[0]],true];};
 assert.equal(collides({x:2,y:3},{x:3,y:3},d,true),true);
 assert.equal(collides({x:2,y:3},{x:3,y:3},{...d,action:'teleport'},true),false);
 assert.deepEqual(seen.options,{preview:false,ignoreWalls:false,ignoreCost:true,history:false});
 assert.deepEqual(seen.path[0],{x:200,y:300,width:1,height:1,depth:1,shape:0,elevation:10,level:'ground',action:'teleport'});
 assert.equal(seen.path[1].x,300);
});
test('native partial, shifted and wrong-level results never admit an edge',()=>{
 const d=fixture();
 for(const mutation of [p=>p.slice(0,1),p=>[p[0],{...p[1],x:p[1].x-1}],p=>[p[0],{...p[1],level:'other'}],p=>[p[0],{...p[1],elevation:11}]]){
  d.token.constrainMovementPath=p=>[mutation(p),false];
  assert.equal(collides({x:2,y:3},{x:3,y:3},d),true);
 }
 d.token.constrainMovementPath=()=>{throw new Error('native failure');};
 assert.throws(()=>collides({x:2,y:3},{x:3,y:3},d),/native failure/);
});
test('shared waypoint conversion preserves snap centers for rectangular and fractional tokens',()=>{
 for(const [width,height,expected] of [[1,1,{x:200,y:300}],[2,3,{x:100,y:200}],[.5,.5,{x:200,y:300}]]){
  const d=fixture({width,height});
  const waypoint=getNativeMovementWaypoint({x:2,y:3},d);
  assert.equal(waypoint.x,expected.x);assert.equal(waypoint.y,expected.y);
  assert.equal(waypoint.elevation,10);assert.equal(waypoint.depth,1);
  let seen;d.token.constrainMovementPath=p=>{seen=p;return [p,false];};
  assert.equal(collides({x:2,y:3},{x:3,y:3},d),false);
  assert.deepEqual(seen[0],waypoint);
 }
});
test('cached walk and teleport edges remain separate for the same token',()=>{
 const d=fixture();d.token.constrainMovementPath=p=>p[1].action==='teleport'?[p,false]:[[p[0]],true];
 const cache=new GriddedCache();
 const walk=cache.getInitializedNode({x:2,y:3},3,10,d);
 const teleport=cache.getInitializedNode({x:2,y:3},3,10,{...d,action:'teleport'});
 assert.equal(walk.neighbors.length,0);assert.equal(teleport.neighbors.length,1);
});

test('complete-route validation rejects native adjustments that independent segments can miss',()=>{
 const d=fixture(),positions=[{x:2,y:3},{x:3,y:3},{x:3,y:4}];
 let seen;
 d.token.constrainMovementPath=p=>{seen=p;return [p,p.length>2];};
 assert.equal(collides(positions[0],positions[1],d),false);
 assert.equal(collides(positions[1],positions[2],d),false);
 assert.equal(nativeRouteIsComplete(positions,d),false);
 assert.equal(seen.length,3);
 d.token.constrainMovementPath=p=>[p,false];
 assert.equal(nativeRouteIsComplete(positions,d),true);
 assert.equal(nativeRouteIsComplete([positions[0]],d),true);
});
