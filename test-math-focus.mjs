import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installMathFocus} from './build/test-exports.mjs';
for(const tag of ['math-inline','math-display']){
 const dom=new JSDOM(`<div id="outer"><${tag} class="math-node"><div tabindex="0"></div></${tag}></div>`);
 const doc=dom.window.document,node=doc.querySelector('.math-node');
 let native=0,inner=0;
 const original=function(){native++;return this;};
 const outer={dom:doc.getElementById('outer'),focus:original,state:{selection:{node:{}}}};
 const math={_outerView:outer,_node:outer.state.selection.node,_innerView:{focus(){inner++;},state:{selection:{anchor:2,head:4}}}};
 node.pmViewDesc={spec:math};
 const stop=installMathFocus(dom.window);
 outer.focus();assert.equal(inner,1);assert.equal(native,0);
 assert.deepEqual(math._innerView.state.selection,{anchor:2,head:4});
 outer.state.selection.node=null;outer.focus();assert.equal(native,1,'Ordinary note focus unchanged');
 outer.state.selection.node=math._node;math._innerView.isDestroyed=true;outer.focus();assert.equal(native,2);
 const other={};assert.equal(outer.focus.call(other),other,'Foreign receiver delegates');
 stop();assert.equal(outer.focus,original);
 const stop2=installMathFocus(dom.window),later=()=>{};outer.focus=later;stop2();assert.equal(outer.focus,later,'Preserve later wrappers');
 dom.window.close();
}
console.log('Inline/display math focus routing, selection retention, guards and cleanup passed.');
