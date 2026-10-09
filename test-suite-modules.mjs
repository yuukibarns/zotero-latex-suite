import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source=readFileSync('suite-modules.js','utf8');
const context=vm.createContext({});vm.runInContext(source,context);
const active=new Map(), calls=[], errors=[];
let listener, settings={};
const env={
 Zotero:{logError:e=>errors.push(e)},
 AddonManager:{getAddonByID:async id=>({isActive:active.get(id)||false}),addAddonListener:l=>listener=l,removeAddonListener:l=>{assert.equal(l,listener);listener=null;}},
 Services:{scriptloader:{loadSubScript:(uri,scope)=>{
   const name=scope.noteControllerKey === '__pseudocodeNotes' ? 'pseudocode' : uri.split('/').at(-2);
   scope.startup=async()=>calls.push('start:'+name);
   scope.shutdown=()=>calls.push('stop:'+name);
   scope.onMainWindowLoad=()=>calls.push('window:'+name);
 }}},
};
active.set('compact-menu@yuukibarns',true);
const manager=await context.SuiteModules.install(env,'resource://suite/',()=>settings);
assert.deepEqual(calls,['start:pseudocode','start:tikzcd','start:page-tools','start:backlinks']);
await manager.refresh();assert.equal(calls.length,4,'No duplicate starts');
settings={tikzcdEnabled:false};await manager.refresh();assert.equal(calls.at(-1),'stop:tikzcd');
settings={};await manager.refresh();assert.equal(calls.at(-1),'start:tikzcd');
listener.onEnabling({id:'tikzcd-preview@yuukibarns'});
assert.equal(calls.at(-1),'stop:tikzcd','Yield before standalone startup');
active.set('tikzcd-preview@yuukibarns',true);listener.onEnabled({id:'tikzcd-preview@yuukibarns'});
await manager.refresh();assert.equal(calls.at(-1),'stop:tikzcd');
active.set('compact-menu@yuukibarns',false);listener.onDisabled({id:'compact-menu@yuukibarns'});
await manager.refresh();assert.equal(calls.at(-1),'start:compact-menu','Take over after standalone disabled');
manager.windowOpened({});assert.equal(calls.at(-1),'window:compact-menu');
manager.dispose();assert.equal(listener,null);assert.deepEqual(errors,[]);
const count=calls.length;await manager.refresh();assert.equal(calls.length,count,'No restart after dispose');
// Disabling while asynchronous startup is pending must still tear it down.
let unblock;
env.Services.scriptloader.loadSubScript=(_uri,scope)=>{
 scope.startup=()=>new Promise(r=>unblock=r);scope.shutdown=()=>calls.push('stopped-pending');
};
settings={pseudocodeEnabled:false,tikzcdEnabled:false,pdfPageToolsEnabled:false,annotationBacklinksEnabled:false,compactMenuEnabled:false};
const delayed=await context.SuiteModules.install(env,'resource://suite/',()=>settings);
settings.compactMenuEnabled=true;const pending=delayed.refresh();
while(!unblock)await new Promise(r=>setImmediate(r));
delayed.dispose();unblock();await pending;
assert.equal(calls.at(-1),'stopped-pending');assert.deepEqual(errors,[]);
console.log('Suite modules: switches, coexistence, window lifecycle and async shutdown passed.');
