import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
let code=await readFile(new URL('../js/cache.js',import.meta.url),'utf8');
code=code.replace(/^import .*;$/gm,'');
code=`const getPixelsFromGridPositionObj=p=>({x:p.x*100,y:p.y*100}); const getSnapPointForTokenDataObj=p=>({x:p.x+50,y:p.y+50});
`+code;
const {stepCollidesWithWall:collides}=await import(url(code));
const ground={id:'ground'},upper={id:'upper'};
globalThis.canvas={scene:{levels:new Map([['ground',ground],['upper',upper]])},level:upper};
function token() {
 return {document:{_source:{level:'ground'},getMovementOrigin:({elevation,depth})=>({x:0,y:0,elevation:elevation+depth*2.5})},checkCollision:()=>false};
}
const data=t=>({token:t,width:1,height:1,depth:2,shape:0,elevation:0,level:'ground'});
test('native token collision receives forward elevated endpoints and explicit move mode',()=>{
 const t=token();let args;
 t.checkCollision=(...a)=>{args=a;return true;};
 assert.equal(collides({x:1,y:2},{x:2,y:2},data(t),true),true);
 assert.deepEqual(args,[{x:250,y:250,elevation:5},{origin:{x:149,y:250,elevation:5},type:'move',mode:'any'}]);
 assert.equal(t.document._source.level,'ground');assert.equal(canvas.level,upper);
});
test('directional collision results stay asymmetric and errors propagate',()=>{
 const t=token();t.checkCollision=(dest,{origin})=>dest.x>origin.x;
 assert.equal(collides({x:1,y:1},{x:2,y:1},data(t)),true);
 assert.equal(collides({x:2,y:1},{x:1,y:1},data(t)),false);
 t.checkCollision=()=>{throw new Error('backend failure');};
 assert.throws(()=>collides({x:1,y:1},{x:2,y:1},data(t)),/backend failure/);
});
test('missing or changed level fails before Foundry can treat it as unobstructed',()=>{
 const t=token();t.checkCollision=()=>{throw new Error('must not call');};
 assert.throws(()=>collides({x:1,y:1},{x:2,y:1},{...data(t),level:'deleted'}),/no longer exists/);
 t.document._source.level='upper';
 assert.throws(()=>collides({x:1,y:1},{x:2,y:1},data(t)),/level changed/);
});
test('tokenless queries initialize a movement source with their level and release it on success and error',()=>{
 const calls=[];let fail=false;
 globalThis.foundry={canvas:{sources:{PointMovementSource:class {
  initialize(d){calls.push(['initialize',d]);}destroy(){calls.push(['destroy']);}
 }}}};
 globalThis.CONFIG={Canvas:{polygonBackends:{move:{testCollision:(from,to,options)=>{
  calls.push(['test',from,to,options]);if(fail)throw new Error('collision error');return false;
 }}}}};
 const d={width:1,height:1,elevation:12,level:'ground'};
 assert.equal(collides({x:0,y:0},{x:1,y:0},d),false);
 assert.deepEqual(calls[0],['initialize',{x:50,y:50,elevation:12,level:'ground'}]);
 assert.equal(calls[1][3].level,ground);assert.equal(calls[1][3].type,'move');assert.deepEqual(calls[2],['destroy']);
 fail=true;assert.throws(()=>collides({x:0,y:0},{x:1,y:0},d),/collision error/);assert.deepEqual(calls.at(-1),['destroy']);
});
