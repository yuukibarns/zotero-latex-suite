import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import * as ls from './build/test-exports.mjs';
import {mathView, StringBuffer, winFor} from './test-editor.mjs';
const ts=(index,from,to=from)=>({index:[index],from,to});
const fraction={insert:'\\frac{}{}',tabstops:[ts(0,6),ts(1,8),ts(2,9)]};
const caret=view=>view.state.selection.to;
function pm() {ls.clearTabstops();const view=mathView('');return {view,b:()=>ls.PMBuffer.forMath(view,'math_inline')};}
// A plain automatic snippet must retain both denominator and final exit.
{
 const {view,b}=pm();ls.expandSnippet(b(),0,0,fraction);
 ls.expandSnippet(b(),6,6,{insert:'\\alpha',tabstops:[]});
 assert.ok(ls.hasTabstops(),'plain numerator expansion retains fraction stops');
 assert.ok(ls.setSelectionToNextTabstop(b(),false));assert.equal(caret(view),14);
 view.dispatch(view.state.tr.insertText('y'));
 assert.ok(ls.setSelectionToNextTabstop(b(),false));assert.equal(caret(view),16);
 assert.equal(ls.hasTabstops(),false);
}
// Inner brace exit must precede outer denominator, even after plain expansion.
{
 const {view,b}=pm();ls.expandSnippet(b(),0,0,fraction);
 view.dispatch(view.state.tr.insertText('a'));
 const settings=ls.processSettings({...ls.DEFAULT_SETTINGS,snippets:'export default '+JSON.stringify([{trigger:'aa',replacement:'\\alpha',options:'mA'}]),snippetVariables:'export default {}'});
 assert.ok(ls.runSnippets(winFor(view),{snippets:settings.snippets,key:'a'},settings,b()));
 assert.equal(view.state.doc.textContent,'\\frac{\\alpha}{}');
 assert.ok(ls.setSelectionToNextTabstop(b(),false));assert.equal(caret(view),14,'actual auto-snippet path preserves denominator');
}
// Inner brace exit must precede outer denominator, even after plain expansion.
{
 const {view,b}=pm();ls.expandSnippet(b(),0,0,fraction);
 ls.expandSnippet(b(),6,6,{insert:'^{}',tabstops:[ts(0,2),ts(1,3)]});
 ls.expandSnippet(b(),8,8,{insert:'\\alpha',tabstops:[]});
 for(const expected of [15,17,18]) {assert.ok(ls.setSelectionToNextTabstop(b(),false));assert.equal(caret(view),expected);}
}
// Future empty stops sharing a boundary stay carets, not growing selections.
{
 const {view,b}=pm();ls.expandSnippet(b(),0,0,{insert:'',tabstops:[ts(0,0),ts(1,0)]});
 view.dispatch(view.state.tr.insertText('xxx'));
 assert.equal(ls.setSelectionToNextTabstop(b(),false),false,'coincident exit needs no second jump');
 assert.equal(ls.hasTabstops(),false,'coincident exit finishes snippet');
 // Moving away before Tab should still select the pending position, not skip it.
 ls.expandSnippet(b(),0,3,{insert:'ab',tabstops:[ts(0,0),ts(1,0),ts(2,2)]});
 b().setSelection(2);
 assert.ok(ls.setSelectionToNextTabstop(b(),false));assert.equal(caret(view),0);
}
// Shift-Tab from a nested first placeholder resumes the outer previous one.
for(let depth=1;depth<=5;depth++) {
 const {view,b}=pm();ls.expandSnippet(b(),0,0,fraction);
 for(let level=0;level<depth;level++) ls.expandSnippet(b(),b().from,b().to,{insert:'^{}',tabstops:[ts(0,2),ts(1,3)]});
 ls.expandSnippet(b(),b().from,b().to,{insert:'\\alpha',tabstops:[]});
 const text=view.state.doc.textContent;
 const exits=[...text.matchAll(/}/g)].slice(0,depth).map(match=>match.index+1);
 for(const expected of [...exits,text.lastIndexOf('{')+1,text.length]) {
  assert.ok(ls.setSelectionToNextTabstop(b(),false));assert.equal(caret(view),expected,`all brace exits survive nesting depth ${depth}`);
 }
 assert.equal(ls.hasTabstops(),false);
}
// Shift-Tab from a nested first placeholder resumes the outer previous one.
{
 const {view,b}=pm();ls.expandSnippet(b(),0,0,fraction);
 ls.setSelectionToNextTabstop(b(),false);
 ls.expandSnippet(b(),8,8,{insert:'^{}',tabstops:[ts(0,2),ts(1,3)]});
 assert.ok(ls.setSelectionToNextTabstop(b(),true));assert.equal(caret(view),6);
}
// Clicking a later placeholder updates the outer continuation index.
{
 const {view,b}=pm();ls.expandSnippet(b(),0,0,{insert:'a+b!',tabstops:[ts(0,0,1),ts(1,2,3),ts(2,4)]});
 b().setSelection(2);
 ls.expandSnippet(b(),2,3,{insert:'^{}',tabstops:[ts(0,2),ts(1,3)]});
 assert.ok(ls.setSelectionToNextTabstop(b(),false));assert.equal(caret(view),5);
 assert.ok(ls.setSelectionToNextTabstop(b(),false));assert.equal(caret(view),6);
 assert.equal(view.state.selection.empty,true,'clicked future placeholder resumes after it, not selecting it again');
}
// Expansion outside an active placeholder starts a new snippet; other owners
// and completed/cleared snippets must not keep stale positions alive.
{
 const {b}=pm();ls.expandSnippet(b(),0,0,fraction);
 const other=mathView('');assert.equal(ls.setSelectionToNextTabstop(ls.PMBuffer.forMath(other,'math_inline'),false),false);
 assert.equal(ls.hasTabstops(),false);
 ls.expandSnippet(b(),0,0,{insert:'x',tabstops:[ts(0,0),ts(1,1)]});
 ls.expandSnippet(b(),b().text.length,b().text.length,{insert:'y',tabstops:[]});
 assert.equal(ls.hasTabstops(),false,'unrelated expansion clears stale stops');
}
// Generic buffers should not accumulate one remap callback per nested snippet.
{
 ls.clearTabstops();const b=new StringBuffer('',0);
 ls.expandSnippet(b,0,0,fraction);
 ls.expandSnippet(b,6,6,{insert:'^{}',tabstops:[ts(0,2),ts(1,3)]});
 b.replaceRange(8,8,'xx');
 assert.equal(b.remaps.length,1);
 for(const expected of [11,13,14]) {assert.ok(ls.setSelectionToNextTabstop(b,false));assert.equal(b.to,expected);}
}
// The annotation contenteditable backend must grow initially empty placeholders.
{
 ls.clearTabstops();const dom=new JSDOM('<div contenteditable="true"></div>');
 const el=dom.window.document.querySelector('div');
 ls.setCaret(el,0);const b=()=>ls.TextBuffer.forElement(el);
 ls.expandSnippet(b(),0,0,fraction);b().replaceRange(6,6,'xx');
 // Nested expansion at the new end is still inside the numerator.
 ls.expandSnippet(b(),8,8,{insert:'^{}',tabstops:[ts(0,2),ts(1,3)]});
 for(const expected of [11,13,14]) {assert.ok(ls.setSelectionToNextTabstop(b(),false));assert.equal(b().to,expected);}
 ls.clearTabstops();dom.window.close();
}
// Nested completion must restore the outer scroll-decoration listener.
{
 ls.clearTabstops();const dom=new JSDOM('<html><head></head><body></body></html>');
 const doc=dom.window.document, handlers=new Set();
 const add=doc.addEventListener.bind(doc),remove=doc.removeEventListener.bind(doc);
 doc.addEventListener=(name,fn,options)=>{if(name==='scroll')handlers.add(fn);add(name,fn,options);};
 doc.removeEventListener=(name,fn,options)=>{if(name==='scroll')handlers.delete(fn);remove(name,fn,options);};
 const b=new StringBuffer('',0);Object.defineProperty(b,'document',{value:doc});
 ls.expandSnippet(b,0,0,fraction);
 ls.expandSnippet(b,6,6,{insert:'xy',tabstops:[ts(0,0),ts(1,2)]});
 ls.setSelectionToNextTabstop(b,false);
 assert.equal(handlers.size,1,'outer marks continue updating after inner snippet exits');
 ls.clearTabstops();assert.equal(handlers.size,0,'clear removes scroll listener');dom.window.close();
}
ls.clearTabstops();console.log('Tabstop regression tests passed.');
