import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('hooks scope wall changes to active scene and invalidate dotted grid updates and size settings',async()=>{
 const once=new Map(),hooks=new Map(),calls={wipe:0,initialize:0,invalidate:0};let setting;
 globalThis.__invalidationCalls=calls;
 globalThis.Hooks={once:(k,f)=>once.set(k,f),on:(k,f)=>hooks.set(k,f),callAll(){}};
 globalThis.CONST={GRID_TYPES:{GRIDLESS:0,SQUARE:1}};
 globalThis.canvas={ready:true,scene:{id:'active'},grid:{type:0}};
 globalThis.window={};
 globalThis.game={settings:{register:(id,key,value)=>{setting=value;}}};
 let code=await readFile(new URL('../js/main.js',import.meta.url),'utf8');
 code=code.replace(/^import .*;$/gm,'');
 code=`const c=globalThis.__invalidationCalls;
 const initializeBackground=()=>{},createAsyncPathfinder=()=>{},cancelJob=()=>{},invalidateJobs=()=>c.invalidate++;
 const cache={},GriddedCache={},initializeCaches=()=>c.initialize++,wipeCaches=()=>c.wipe++,disposeCaches=()=>{};
 const GriddedPathfinder=class{},GridlessPathfinder=class{},initGridlessPathfinding=()=>Promise.resolve();
 const getAltOrientationFlagForToken=()=>false,getHexTokenSize=()=>1,isModuleActive=()=>false;
 `+code;
 await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 await once.get('init')();await once.get('ready')();await new Promise(resolve=>setImmediate(resolve));
 for(const event of ['createWall','updateWall','deleteWall']){
  hooks.get(event)({parent:{id:'other'}});assert.equal(calls.wipe,0);
 }
 for(const event of ['createWall','updateWall','deleteWall'])hooks.get(event)({parent:{id:'active'}});
 assert.equal(calls.wipe,3);
 hooks.get('updateScene')({id:'other'},{grid:{size:50}});assert.equal(calls.invalidate,0);
 hooks.get('updateScene')({id:'active'},{name:'Renamed'});assert.equal(calls.invalidate,0);
 hooks.get('updateScene')({id:'active'},{'grid.size':50});assert.equal(calls.invalidate,1);
 hooks.get('updateScene')({id:'active'},{grid:{type:1}});assert.equal(calls.invalidate,2);
 setting.onChange();assert.equal(calls.wipe,4);
 canvas.ready=false;setting.onChange();assert.equal(calls.wipe,4);
 hooks.get('updateToken')({parent:{id:'other'}},{level:'upper'});assert.equal(calls.invalidate,2);
 hooks.get('updateToken')({parent:{id:'active'}},{x:50,y:50});assert.equal(calls.invalidate,2);
 for(const changes of [{level:'upper'},{depth:2},{'flags.wall-height.height':20}])hooks.get('updateToken')({parent:{id:'active'}},changes);
 assert.equal(calls.invalidate,5);
 for(const event of ['createLevel','updateLevel','deleteLevel'])hooks.get(event)({parent:{id:'other'}});
 assert.equal(calls.invalidate,5);
 for(const event of ['createLevel','updateLevel','deleteLevel'])hooks.get(event)({parent:{id:'active'}});
 assert.equal(calls.invalidate,8);
 for(const name of ['Region','RegionBehavior'])for(const operation of ['create','update','delete']){
  const event=hooks.get(operation+name);
  const doc=id=>({documentName:name,parent:name==='RegionBehavior'?{parent:{id}}:{id}});
  const previous=calls.invalidate;event(doc('other'));assert.equal(calls.invalidate,previous);
  event(doc('active'));assert.equal(calls.invalidate,previous+1);
 }
});
