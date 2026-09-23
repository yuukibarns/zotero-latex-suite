import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installMathPreview} from './build/test-exports.mjs';
const dom=new JSDOM('<!doctype html><math-inline class="math-node"><div class="math-src" tabindex="0"></div><div class="math-render"></div></math-inline>',{pretendToBeVisual:true});
const win=dom.window,doc=win.document,source=doc.querySelector('.math-src'),render=doc.querySelector('.math-render');
let now=0,id=0,text='x',renders=0;
const timers=new Map(),frames=new Map();
win.setTimeout=(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;};
win.clearTimeout=id=>timers.delete(id);
win.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};
win.cancelAnimationFrame=id=>frames.delete(id);
const math={_innerView:{state:{doc:{get textContent(){return text;}}}},_mathRenderElt:render,renderMath(){renders++;render.textContent=text;}};
doc.querySelector('.math-node').pmViewDesc={spec:math};
source.focus();
async function step(ms=0){
 now+=ms;await Promise.resolve();
 for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}
 for(const [id,fn] of [...frames]){frames.delete(id);fn();}
 await Promise.resolve();
}
async function type(value){text=value;source.dispatchEvent(new win.Event('input',{bubbles:true}));await step();}
const popup=()=>doc.getElementById('latex-suite-math-preview');
let stop=installMathPreview(win,100);
await step();assert.equal(renders,0);
await step(100);assert.equal(renders,1);assert.equal(popup().firstChild.textContent,'x');
await type('xy');await step(50);await type('xyz');await step(50);
assert.equal(renders,1);assert.equal(popup().firstChild.textContent,'x');
win.dispatchEvent(new win.Event('resize'));await step();
await step(50);assert.equal(renders,2);assert.equal(popup().firstChild.textContent,'xyz');
await type('pending');source.dispatchEvent(new win.Event('compositionstart',{bubbles:true}));
await step(200);assert.equal(renders,2);
source.dispatchEvent(new win.Event('compositionend',{bubbles:true}));await step();await step(100);assert.equal(renders,3);
await type('discard');source.blur();await step();await step(100);
assert.equal(renders,3);assert.equal(popup(),null);
source.focus();await step();stop();await step(200);
assert.equal(renders,3);assert.equal(popup(),null);assert.equal(timers.size,0);assert.equal(frames.size,0);
stop=installMathPreview(win,0);await step();assert.equal(renders,4);
await type('immediate');assert.equal(renders,5);stop();
stop=installMathPreview(win,250);await step();await step(249);assert.equal(renders,5);
await step(1);assert.equal(renders,6);stop();
stop=installMathPreview(win,NaN);await step();await step(99);assert.equal(renders,6);
await step(1);assert.equal(renders,7);stop();
dom.window.close();
console.log('Preview debounce, retention, positioning events, IME and cleanup tests passed.');
