import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installMathPreview,previewMarkerSource,renderPreviewMarker,PREVIEW_CARET,previewMarkerColor,createMathSourceMap} from './build/test-exports.mjs';
import katex from 'katex-zotero';
import {EditorState,TextSelection} from 'prosemirror-state';
import {Schema} from 'prosemirror-model';
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
// Gecko's inline wrapper may cover just the final line of a wrapped editor.
math._innerView.dom=source;
const node=doc.querySelector('.math-node');
node.getBoundingClientRect=()=>new win.DOMRect(20,450,400,20);
source.getBoundingClientRect=()=>new win.DOMRect(20,300,400,170);
stop=installMathPreview(win,0);await step();
Object.defineProperty(popup(),'offsetHeight',{value:80});
Object.defineProperty(popup(),'offsetWidth',{value:200});
win.dispatchEvent(new win.Event('resize'));await step();
assert.equal(popup().style.top,'214px','preview is above all wrapped source lines');
const blocker=doc.createElement('div');blocker.id='latex-suite-completion';
blocker.getBoundingClientRect=()=>new win.DOMRect(20,0,200,300);
doc.body.append(blocker);await step();
assert.equal(popup().style.visibility,'','completion overlap does not hide or move preview');
assert.equal(popup().style.top,'214px');
blocker.remove();await step();assert.equal(popup().style.visibility,'');
assert.equal(popup().style.top,'214px');
source.getBoundingClientRect=()=>new win.DOMRect(20,20,400,170);
node.getBoundingClientRect=()=>new win.DOMRect(20,170,400,20);
win.dispatchEvent(new win.Event('resize'));await step();
assert.equal(popup().style.visibility,'hidden','insufficient room above hides instead of flipping');
const menu=doc.createElement('div');menu.id='latex-suite-completion';
menu.getBoundingClientRect=()=>new win.DOMRect(20,195,200,200);
doc.body.append(menu);await step();
assert.equal(popup().style.visibility,'hidden','completion cannot force preview below');
source.getBoundingClientRect=()=>new win.DOMRect(20,0,400,win.innerHeight);
win.dispatchEvent(new win.Event('resize'));await step();
assert.equal(popup().style.visibility,'hidden','no room must not obscure source');
source.getBoundingClientRect=()=>new win.DOMRect(20,300,400,170);
node.getBoundingClientRect=()=>new win.DOMRect(20,450,400,20);
menu.remove();doc.dispatchEvent(new win.Event('scroll'));await step();
assert.equal(popup().style.visibility,'');assert.equal(popup().style.top,'214px');
assert.equal(win.getComputedStyle(popup()).pointerEvents,'auto','preview receives pointer input');
assert.equal(win.getComputedStyle(popup()).overflow,'auto');
assert.ok(Math.abs(parseFloat(win.getComputedStyle(popup()).maxHeight)-win.innerHeight*.35)<.01,'floating inline preview remains bounded');
const contentClick=new win.MouseEvent('mousedown',{bubbles:true,cancelable:true});
popup().firstChild.dispatchEvent(contentClick);assert.equal(contentClick.defaultPrevented,true,'formula click preserves source focus');
assert.equal(doc.activeElement,source);
const scrollbarClick=new win.MouseEvent('mousedown',{bubbles:true,cancelable:true});
popup().dispatchEvent(scrollbarClick);assert.equal(scrollbarClick.defaultPrevented,false,'native scrollbar dragging is allowed');
const wheelEvent=new win.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:100});
popup().dispatchEvent(wheelEvent);assert.equal(wheelEvent.defaultPrevented,false,'wheel uses browser native scrolling');
await step();const beforeScroll=renders;
popup().scrollTop=40;popup().dispatchEvent(new win.Event('scroll',{bubbles:true}));
assert.equal(frames.size,0,'preview scrolling does not schedule positioning');
await step();assert.equal(renders,beforeScroll);assert.equal(popup().scrollTop,40);
stop();
const display=doc.createElement('math-display');display.className='math-node';
display.pmViewDesc={spec:math};display.append(source,render);node.replaceWith(display);
source.focus();stop=installMathPreview(win,0);await step();
assert.equal(popup().dataset.inline,'false');
assert.equal(win.getComputedStyle(popup()).maxHeight,'none','display preview has no height cap');
assert.equal(win.getComputedStyle(popup()).overflow,'visible','wide display preview uses outer editor scrolling');
assert.equal(win.getComputedStyle(popup()).width,'max-content','display preview expands to natural equation width');
assert.equal(win.getComputedStyle(popup()).minWidth,'100%','short equations retain full note-width preview');
assert.equal(win.getComputedStyle(popup()).maxWidth,'none','display preview has no width cap');
assert.equal(popup().parentNode,display,'display preview stays in note flow');
let outerClicks=0;display.addEventListener('mousedown',()=>outerClicks++);display.addEventListener('click',()=>outerClicks++);
math._innerView.focus=()=>source.focus();
const trackDown=new win.MouseEvent('mousedown',{bubbles:true,cancelable:true});
popup().dispatchEvent(trackDown);assert.equal(trackDown.defaultPrevented,false);
source.blur();await step();assert.ok(popup(),'scrollbar focus change does not close preview during drag');
doc.dispatchEvent(new win.MouseEvent('mouseup',{bubbles:true}));await step();
assert.equal(doc.activeElement,source,'drag release restores math source focus');
popup().dispatchEvent(new win.MouseEvent('click',{bubbles:true,cancelable:true}));
assert.equal(outerClicks,0,'scrollbar clicks do not reach outer math editor');
assert.ok(popup());
stop();
// Exercise the preview-only render contract with Zotero's KaTeX version.
const nativeSource='\\frac{a}{b}+x^2';
const originalNode={content:{firstChild:{textContent:nativeSource}}};
const isolated={_node:originalNode,_mathRenderElt:render,_katexOptions:{macros:{}},dom:display,
 renderMath(){try{this._mathRenderElt.innerHTML=katex.renderToString(this._node.content.firstChild.textContent,this._katexOptions);}catch{this._mathRenderElt.classList.add('parse-error');}}};
render.textContent='native untouched';
for(let head=0;head<=nativeSource.length;head++){
 const target=doc.createElement('div');
 assert.equal(renderPreviewMarker(isolated,target,nativeSource,head),true,`safe fraction/script position ${head}`);
 assert.ok(target.querySelector('.ls-preview-caret .rule'));
 assert.equal(target.querySelector('.ls-preview-caret').getAttribute('aria-hidden'),'true');
 assert.equal(isolated._node,originalNode);assert.equal(render.textContent,'native untouched');
}
const marker=PREVIEW_CARET;
const productSource=String.raw`d\mathbb{P} (\omega) = \left( \prod_{i = 1}^{n} Q_{t_{i}} (x_{i} | x_{i - 1}) \right) \exp \left(-\int_{0}^{T} \lambda_{t} (X_{t}) dt\right)`;
for(const displayMode of [false,true])for(const position of ['i =','1}','n}','0}','T}']) {
 const target=doc.createElement('div'),head=productSource.indexOf(position);
 assert.equal(renderPreviewMarker({...isolated,_katexOptions:{displayMode}},target,productSource,head),true);
 assert.ok(createMathSourceMap()(target.querySelector('.katex-html'),productSource,{displayMode}),`marker does not change delimiter representation at ${position}`);
}
for(const displayMode of [false,true])for(const command of ['\\prod','\\sum','\\int','\\bigcup'])for(const suffix of ['_{i=1}^{n}b','\\limits_{i=1}^{n}b','\\nolimits_{i=1}^{n}b']) {
 const value=command+suffix, target=doc.createElement('div');
 assert.equal(renderPreviewMarker({...isolated,_katexOptions:{displayMode}},target,value,command.length),true);
 assert.ok(createMathSourceMap()(target.querySelector('.katex-html'),value,{displayMode}),'operator-end marker preserves glyph order and subsequent click mapping');
}
assert.equal(previewMarkerSource('\\alpha',3),marker+'\\alpha');
for (const command of ['\\cos','\\sin','\\alpha','\\sum']) {
 assert.equal(previewMarkerSource(command,command.length),command+marker,'command-end caret stays after non-argument command');
 assert.equal(previewMarkerSource(command,2),marker+command,'inside command snaps to start');
}
const screenshotSource='\\sin^{2} x + \\cos';
assert.equal(previewMarkerSource(screenshotSource,screenshotSource.length),screenshotSource+marker,'reported cos screenshot regression');
assert.equal(previewMarkerSource('\\frac{a}{b}',5),'\\frac{'+marker+'a}{b}','marker cannot become fraction numerator');
assert.equal(previewMarkerSource('\\frac{a}{b}',8),'\\frac{a}{'+marker+'b}','marker cannot become fraction denominator');
assert.equal(previewMarkerSource('\\mathbb{E}',7),'\\mathbb{'+marker+'E}','marker stays inside font argument');
assert.equal(previewMarkerSource('\\text{hello}',5),'\\text{'+marker+'hello}','marker stays inside text argument');
const regressionTarget=doc.createElement('div');
assert.equal(renderPreviewMarker(isolated,regressionTarget,screenshotSource,screenshotSource.length),true);
const visual=regressionTarget.querySelector('.katex-html');
const cos=[...visual.querySelectorAll('*')].find(el=>el.textContent==='cos');
assert.ok(cos.compareDocumentPosition(visual.querySelector('.ls-preview-caret')) & win.Node.DOCUMENT_POSITION_FOLLOWING,'rendered marker follows cos');
assert.equal(previewMarkerSource('\\begin{aligned}x\\end{aligned}',9),marker+'\\begin{aligned}x\\end{aligned}');
for(const [value,head] of [['\\text{hello}',8],['\\left(x\\right)',6],['x^{2}',3],['\\begin{array}{c}x\\end{array}',14]]){
 assert.equal(renderPreviewMarker(isolated,doc.createElement('div'),value,head),true,`text/delimiter/metadata ${value}`);
}
const macroOptions={macros:{'\\foo':'x'}};
const macroView={...isolated,_katexOptions:macroOptions,renderMath(){
 assert.equal(this._katexOptions.trust({command:'\\htmlClass',class:'ls-preview-caret'}),true);
 for(const context of [{command:'\\href',url:'https://example.com'},{command:'\\htmlStyle',style:'color:red'},{command:'\\htmlClass',class:'other'}]) assert.equal(this._katexOptions.trust(context),false);
 this._katexOptions.macros['\\foo']='changed';this._mathRenderElt.textContent='marker';
}};
renderPreviewMarker(macroView,doc.createElement('div'),'x',0);
assert.deepEqual(macroOptions.macros,{'\\foo':'x'},'preview renderer cannot mutate shared macro dictionary');
assert.equal(macroOptions.trust,undefined,'native trust settings remain untouched');
const target=doc.createElement('div');target.textContent='keep';
assert.equal(renderPreviewMarker(isolated,target,'\\frac{',6),false);assert.equal(target.textContent,'keep');
// A failed decorated rendering falls back; noncollapsed selection hides marker.
math._innerView.state.selection={empty:true,head:1};
math.renderMath=function(){renders++;this._mathRenderElt.textContent=this._node?.content.firstChild.textContent ?? text;};
text='ab';source.focus();stop=installMathPreview(win,0);await step();
assert.equal(popup().firstChild.textContent,'a'+marker+'b');
const nativeRenders=renders;
math._innerView.state.selection.head=2;doc.dispatchEvent(new win.Event('selectionchange'));await step();
assert.equal(popup().firstChild.textContent,'ab'+marker);
assert.equal(renders,nativeRenders+1,'selection rerenders only detached preview');assert.equal(render.textContent,'ab');
math._innerView.state.selection.empty=false;doc.dispatchEvent(new win.Event('selectionchange'));await step();
assert.equal(popup().firstChild.textContent,'ab');stop();
assert.equal(previewMarkerColor(' #Ab12EF '),'#Ab12EF');
for(const invalid of [null,'red','#fff','url(test)','#ffffff;opacity:0']) assert.equal(previewMarkerColor(invalid),'#d9468f');
for(const value of ['\\begin{matrix}a&b\\\\c&d\\end{matrix}','x_{i}^{t}','\\text{hello}']) {
 for(let head=0;head<=value.length;head++) assert.equal(renderPreviewMarker(isolated,doc.createElement('div'),value,head),true,`${value} at ${head}`);
}
math._innerView.state.selection={empty:true,head:1};
source.focus();stop=installMathPreview(win,0,true,true,{color:'#123456',blink:true});await step();
assert.equal(popup().style.getPropertyValue('--ls-preview-caret-color'),'#123456');
assert.equal(popup().dataset.markerIdle,'false');
const steadyRenders=renders;
await step(599);assert.equal(popup().dataset.markerIdle,'false');
await step(1);assert.equal(popup().dataset.markerIdle,'true');
await step(2000);assert.equal(renders,steadyRenders,'blinking does not rerender math');
source.dispatchEvent(new win.KeyboardEvent('keydown',{bubbles:true,key:'ArrowRight'}));
assert.equal(popup().dataset.markerIdle,'false');await step();
source.dispatchEvent(new win.Event('compositionstart',{bubbles:true}));
await step(1000);assert.equal(popup().dataset.markerIdle,'false');
source.dispatchEvent(new win.Event('compositionend',{bubbles:true}));await step();
await step(600);assert.equal(popup().dataset.markerIdle,'true');
await type('abc');assert.equal(popup().dataset.markerIdle,'false');
stop();assert.equal(timers.size,0);await step(1000);assert.equal(popup(),null);
// Preview clicks reuse source mapping against the actual decorated DOM.
const schema=new Schema({nodes:{doc:{content:'text*'},text:{}}});
win.Range.prototype.getBoundingClientRect=()=>new win.DOMRect(0,0,10,20);
win.Element.prototype.getBoundingClientRect=()=>new win.DOMRect(0,0,10,20);
math._katexOptions={};
math.renderMath=function(){this._mathRenderElt.innerHTML=katex.renderToString(this._node?.content.firstChild.textContent ?? this._innerView.state.doc.textContent,this._katexOptions);};
function clickGlyph(glyph,options={}) {
 const target=[...popup().querySelectorAll('.katex-html span')].find(el=>el.textContent===glyph&&!el.children.length);
 assert.ok(target,`preview glyph ${glyph}`);
 for(const name of ['mousedown','mouseup','click'])target.dispatchEvent(new win.MouseEvent(name,{bubbles:true,cancelable:true,clientX:8,clientY:10,...options}));
}
for(const tag of ['math-inline','math-display'])for(const value of ['a+b+c','\\frac{a}{b}','x_{b}^{t}','\\begin{matrix}a&b\\\\c&d\\end{matrix}','\\prod_{i=1}^{n}b']) {
 const host=doc.createElement(tag);host.className='math-node';host.pmViewDesc={spec:math};host.append(source,render);doc.body.append(host);
 math._innerView={dom:source,state:EditorState.create({schema,doc:schema.node('doc',null,schema.text(value))}),dispatch(tr){this.state=this.state.apply(tr);},focus(){source.focus();}};
 source.focus();stop=installMathPreview(win,0);await step();
 if(value.startsWith('\\prod')){clickGlyph('∏');assert.equal(math._innerView.state.selection.head,5);await step();}
 clickGlyph('b');assert.equal(math._innerView.state.selection.head,value.lastIndexOf('b')+1,'preview click maps source boundary');
 assert.equal(doc.activeElement,source);await step();assert.ok(popup());
 math._innerView.state=math._innerView.state.apply(math._innerView.state.tr.setSelection(TextSelection.create(math._innerView.state.doc,0)));await step();
 for(const options of [{button:2},{ctrlKey:true},{shiftKey:true},{altKey:true},{metaKey:true}]){clickGlyph('b',options);assert.equal(math._innerView.state.selection.head,0);}
 math._innerView.editable=false;clickGlyph('b');assert.equal(math._innerView.state.selection.head,0);math._innerView.editable=true;
 const glyph=[...popup().querySelectorAll('.katex-html span')].find(el=>el.textContent==='b'&&!el.children.length);
 glyph.dispatchEvent(new win.MouseEvent('mousedown',{bubbles:true,clientX:8,clientY:10}));
 doc.dispatchEvent(new win.MouseEvent('mousemove',{bubbles:true,clientX:50,clientY:10,buttons:1}));
 glyph.dispatchEvent(new win.MouseEvent('click',{bubbles:true,clientX:8,clientY:10}));
 assert.equal(math._innerView.state.selection.head,0,'dragging away and back does not place caret');
 // A retained old preview must never map into newly typed source.
 math._innerView.state=math._innerView.state.apply(math._innerView.state.tr.insertText('z',0));
 const before=math._innerView.state.selection.head;clickGlyph('b');assert.equal(math._innerView.state.selection.head,before);
 stop();host.remove();
}
dom.window.close();
console.log('Preview debounce, retention, positioning events, IME and cleanup tests passed.');
