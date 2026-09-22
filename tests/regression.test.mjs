import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = name => readFile(new URL('../js/' + name, import.meta.url), 'utf8');
const moduleURL = s => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const load = async name => import(moduleURL(await dependency(name)));
const dependency = async name => name === 'util.js' ? (await source(name)).replace('./foundry_fixes.js', moduleURL(await source('foundry_fixes.js'))) : source(name);

test('priority queue replaces cheaper duplicates at head, middle, and tail', async () => {
 const {PriorityQueueSet} = await load('data_structures.js');
 for (const id of ['a', 'b', 'c']) {
  const q = new PriorityQueueSet((a,b) => a.id === b.id, a => a.cost);
  for (const [i, id] of ['a','b','c'].entries()) q.pushWithPriority({id, cost:10+i});
  q.pushWithPriority({id,cost:2}); q.pushWithPriority({id,cost:20});
  const result=[]; while(q.hasNext()) result.push(q.pop());
  assert.equal(result.length,3); assert.deepEqual(result[0],{id,cost:2});
  assert.equal(new Set(result.map(x=>x.id)).size,3);
 }
});

test('scheduler isolates step, postprocessing and cleanup failures', async () => {
 globalThis.window={setTimeout,clearTimeout};
 const scheduler=await load('background.js');
 for (const failure of ['step','postProcessResult','free']) {
  scheduler.initializeBackground();
  let frees=0;
  const bad={step:()=>1,postProcessResult:x=>x,free:()=>{frees++;}};
  const original=bad[failure];
  bad[failure]=()=>{original();throw new Error(failure);};
  const rejected=assert.rejects(scheduler.createAsyncPathfinder(bad),new RegExp(failure));
  const good=scheduler.createAsyncPathfinder({step:()=>2,postProcessResult:x=>x+1,free(){}});
  await rejected; assert.equal(await good,3); assert.equal(frees,1);
 }
});

test('coordinate adapters preserve asymmetric coordinates and Foundry row/column order', async () => {
 globalThis.CONST={GRID_TYPES:{GRIDLESS:0,SQUARE:1},GRID_DIAGONALS:{EQUIDISTANT:0,EXACT:1,APPROXIMATE:2,RECTILINEAR:3,ALTERNATING_1:4,ALTERNATING_2:5,ILLEGAL:6}};
 globalThis.canvas={grid:{type:1,
  getTopLeftPoint:({i,j})=>({x:j*100,y:i*100}),
  getCenterPoint:({i,j})=>({x:j*100+50,y:i*100+50}),
  getOffset:({x,y})=>({i:Math.floor(y/100),j:Math.floor(x/100)})}};
 const c=await load('foundry_fixes.js');
 assert.deepEqual(c.getPixelsFromGridPositionObj({x:2,y:7}),{x:200,y:700});
 assert.deepEqual(c.getGridPositionFromPixelsObj({x:250,y:750}),{x:2,y:7});
 assert.deepEqual(c.getCenterFromGridPositionObj({x:2,y:7}),{x:250,y:750});
 // Offset hex rows do not permit compensating x/y swaps.
 canvas.grid.type=2;
 canvas.grid.getTopLeftPoint=({i,j})=>({x:100*j+50*(i%2),y:75*i});
 assert.deepEqual(c.getPixelsFromGridPositionObj({x:2,y:7}),{x:250,y:525});
 canvas.grid.type=0;
 assert.deepEqual(c.getPixelsFromGridPositionObj({x:17,y:31}),{x:17,y:31});
 assert.deepEqual(c.getGridPositionFromPixelsObj({x:17,y:31}),{x:17,y:31});
});

test('exact diagonal budgets and gridless reset handle', async()=>{
 globalThis.CONST={GRID_TYPES:{GRIDLESS:0,SQUARE:1},GRID_DIAGONALS:{EQUIDISTANT:0,EXACT:1,APPROXIMATE:2,RECTILINEAR:3,ALTERNATING_1:4,ALTERNATING_2:5,ILLEGAL:6}};
 globalThis.game={system:{id:'dnd5e'}};
 globalThis.window={};
 globalThis.canvas={grid:{type:1,sizeX:100,sizeY:100},scene:{grid:{type:1},dimensions:{distance:5}},dimensions:{width:1000,height:1000,distance:5}};
 const nodes=[{x:0,y:0,neighbors:[{x:1,y:1,isDiagonal:true}]},{x:1,y:1,neighbors:[]}];
 globalThis.__routingTestCache={getInitializedNode:pos=>nodes.find(n=>n.x===pos.x&&n.y===pos.y)};
 globalThis.__routingResetHandle=null;
 let code=await source('pathfinder.js');
 code=code.replace('import {cache, stepCollidesWithWall} from "./cache.js";', 'const cache=globalThis.__routingTestCache; const stepCollidesWithWall=()=>false;');
 for(const name of ['data_structures.js','foundry_fixes.js','util.js','movement_cost.js']) code=code.replace('./'+name,moduleURL(await dependency(name)));
 code=code.replace('import * as GridlessPathfinding from "./gridless.js";', 'const GridlessPathfinding={initializePathfinder:()=>123,resetPathfinder:h=>{globalThis.__routingResetHandle=h;}};');
 const {GriddedPathfinder,GridlessPathfinder}=await import(moduleURL(code));
 for(const alternating of [false,true]) {
  canvas.grid.diagonals=alternating?4:0;
  for(const [budget,expected] of [[4,null],[5,5]]) {
   const p=new GriddedPathfinder(0,0,{x:0,y:0},{x:1,y:1},null,{width:1,height:1},{maxDistance:budget,interpolate:false});
   let result;for(let i=0;i<10&&result===undefined;i++)result=p.step();
   assert.equal(result===null?null:p.postProcessResult(result).cost,expected);
  }
 }
 const p=new GridlessPathfinder({}, {}, {}, {});p.reset();assert.equal(globalThis.__routingResetHandle,123);
});


test('scene invalidation frees queued searches once and resolves no route', async()=>{
 globalThis.window={setTimeout,clearTimeout};
 const scheduler=await load('background.js');scheduler.initializeBackground();
 let frees=0; let steps=0;
 const p=scheduler.createAsyncPathfinder({step(){steps++;},free(){frees++;}});
 scheduler.invalidateJobs();assert.equal(await p,null);assert.equal(frees,1);assert.equal(steps,0);
});


test('cancellation removes a job even when cleanup throws and preserves promise identity',async()=>{
 globalThis.window={setTimeout,clearTimeout};
 const scheduler=await load('background.js');scheduler.initializeBackground();
 let steps=0,frees=0;
 const p=scheduler.createAsyncPathfinder({step(){steps++;},free(){frees++;throw new Error('cleanup failed');}});
 const rejection=assert.rejects(p,/cleanup failed/);
 assert.equal(scheduler.cancelJob(p),true);assert.equal(scheduler.cancelJob(p),false);
 await rejection;
 const good=scheduler.createAsyncPathfinder({step:()=>1,postProcessResult:x=>x,free(){}});
 assert.equal(await good,1);assert.equal(steps,0);assert.equal(frees,1);
});
