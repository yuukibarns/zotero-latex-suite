// Optional integration test against the installed Zotero bundle (no user profile).
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { Context, createMathSelection, installMathPaste, installMathPreview, installMathHighlight, installImageResize, installAnnotationCompletion, PMBuffer, rememberSelectionClass, expandSnippet, setSelectionToNextTabstop, clearTabstops } from './build/test-exports.mjs';
const archive = process.env.ZOTERO_ARCHIVE || '/usr/lib/zotero/app/omni.ja';
const dom = new JSDOM('<!doctype html><div id="editor-container"></div>', {runScripts:'outside-only', pretendToBeVisual:true, url:'https://example.invalid/'});
const win = dom.window;
win.alert = message => { console.error(message); };
win.DataTransfer = class { values=new Map(); setData(k,v){this.values.set(k,v);} getData(k){return this.values.get(k)||'';} get types(){return [...this.values.keys()];} files=[]; };
win.ClipboardEvent = class extends win.Event { constructor(type,options={}) {super(type,options);this.clipboardData=options.clipboardData||new win.DataTransfer();} };
win.matchMedia = () => ({matches:false,addEventListener(){},removeEventListener(){}});
win.Range.prototype.getClientRects = () => [];
win.Range.prototype.getBoundingClientRect = () => ({left:0,right:0,top:0,bottom:0});
try {
 for (const path of ['resource/react.js','resource/react-dom.js','resource/prop-types.js','resource/note-editor/editor.js']) {
  win.eval((await exec('unzip',['-p',archive,path],{maxBuffer:20*1024*1024})).stdout);
 }
 const stopEarlyResize=installImageResize(win);
 win.dispatchEvent(new win.MessageEvent('message',{data:{instanceID:'test',message:{action:'init',value:'<div data-schema-version="9"><p></p></div>',font:{fontFamily:'sans-serif',fontSize:14},dir:'ltr',viewMode:'library',readOnly:false}}}));
 await new Promise(resolve=>setTimeout(resolve,100));
 const view = win._currentEditorInstance._editorCore.view;
 assert.ok(win.document.getElementById('latex-suite-image-resize'),'resizing attaches after actual Zotero async init');
 stopEarlyResize();
 const stopAnnotations=installAnnotationCompletion(win);
 let earlyRequests=0;
 win.__latexSuiteAnnotations=async()=>{earlyRequests++;return '[]';};
 view.focus();view.dispatch(view.state.tr.insertText('@@a'));
 view.dom.dispatchEvent(new win.Event('input',{bubbles:true}));
 await new Promise(resolve=>setTimeout(resolve,180));
 assert.equal(earlyRequests,0,'no search before minimum prefix');
 assert.equal(win.document.getElementById('latex-suite-annotations'),null);
 view.dispatch(view.state.tr.delete(1,4));
 win.__latexSuiteAnnotations=async id=>id===undefined ? JSON.stringify([{id:1,comment:'Comment first',text:'Highlighted text',type:'note',page:'2',source:'Paper'}]) : 'Highlighted text <b>literal</b> $x$';
 view.focus();view.dispatch(view.state.tr.insertText('@@Comment'));
 view.dom.dispatchEvent(new win.Event('input',{bubbles:true}));
 await new Promise(resolve=>setTimeout(resolve,180));
 assert.ok(win.document.querySelector('#latex-suite-annotations [role=option]'),'annotation results in native editor');
 assert.equal(win.document.querySelector('#latex-suite-annotations .annotation-text').textContent,'Highlighted text');
 assert.equal(win.document.querySelector('#latex-suite-annotations .annotation-comment').textContent,'Comment first');
 const annotationContent=win.document.querySelector('#latex-suite-annotations .annotation-content');
 assert.equal(annotationContent.textContent,'Highlighted text · Comment first');
 assert.equal(annotationContent.style.whiteSpace,'nowrap');
 const annotationSource=win.document.querySelector('#latex-suite-annotations .annotation-source');
 assert.equal(annotationSource.textContent,'Paper');
 assert.equal(annotationSource.previousElementSibling,annotationContent,'source title appears below text and comment');
 assert.equal(annotationSource.style.opacity,'0.65');
 const annotationPanel=win.document.getElementById('latex-suite-annotations');
 const initialSide=annotationPanel.dataset.side;
 let detached=false;
 const monitor=new win.MutationObserver(records=>{for(const record of records) if([...record.removedNodes].includes(annotationPanel)) detached=true;});
 monitor.observe(win.document.body,{childList:true});
 view.dispatch(view.state.tr.insertText('x'));
 view.dom.dispatchEvent(new win.Event('input',{bubbles:true}));
 win.document.dispatchEvent(new win.Event('selectionchange'));
 assert.ok(annotationPanel.isConnected,'typing keeps existing menu visible');
 await new Promise(resolve=>setTimeout(resolve,180));
 assert.equal(detached,false,'result update never removes the popup');
 assert.equal(annotationPanel.dataset.side,initialSide,'menu side is stable');
 assert.ok(!annotationPanel.textContent.includes('Loading'),'subsequent matching does not flash loading');
 monitor.disconnect();
 win.document.querySelector('#latex-suite-annotations [role=option]').dispatchEvent(new win.MouseEvent('mousedown',{bubbles:true,cancelable:true}));
 await new Promise(resolve=>setTimeout(resolve,50));
 assert.equal(view.state.doc.textContent,'Highlighted text <b>literal</b> $x$');
 const insertedNodes=[];view.state.doc.descendants(node=>insertedNodes.push(node.type.name));
 assert.ok(insertedNodes.every(name=>['paragraph','text'].includes(name)),'completion inserts ordinary text only');
 assert.ok(!view.state.doc.textContent.includes('@@Comment'));
 assert.ok(win.doUndo());assert.equal(view.state.doc.textContent,'@@Commentx');
 view.dispatch(view.state.tr.delete(1,view.state.doc.content.size-1));
 stopAnnotations();
 let wordConfig={bufferCompletionEnabled:true,dictionaryCompletionEnabled:true,textDictionaryWords:'probability\nproblem\nprogress'};
 let annotationRequests=0;win.__latexSuiteAnnotations=async()=>{annotationRequests++;return '[]';};
 const stopWords=installAnnotationCompletion(win,()=>2,()=>wordConfig);
 const tickWords=()=>new Promise(resolve=>setTimeout(resolve,180));
 const inputWords=()=>view.dom.dispatchEvent(new win.Event('input',{bubbles:true}));
 const keyWords=(key,options={})=>win.dispatchEvent(new win.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options}));
 view.focus();view.dispatch(view.state.tr.insertText('probable pro'));inputWords();await tickWords();
 assert.equal(annotationRequests,0,'word completion never requests library annotations');
 assert.ok(win.document.querySelector('#latex-suite-annotations').textContent.includes('Buffer'));
 assert.ok(win.document.querySelector('#latex-suite-annotations').textContent.includes('Dictionary'));
 keyWords('Enter');
 assert.equal(view.state.doc.textContent,'probable probable','buffer suggestion replaces only typed prefix');
 assert.ok(win.doUndo());assert.equal(view.state.doc.textContent,'probable pro','word insertion has separate undo');
 view.dispatch(view.state.tr.delete(1,view.state.doc.content.size-1));
 wordConfig={...wordConfig,bufferCompletionEnabled:false};
 view.dispatch(view.state.tr.insertText('prog'));inputWords();await tickWords();
 assert.equal(win.document.querySelector('#latex-suite-annotations .annotation-text').textContent,'progress');
 keyWords('Enter');assert.equal(view.state.doc.textContent,'progress');
 assert.ok(win.doUndo());assert.equal(view.state.doc.textContent,'prog');
 inputWords();await tickWords();
 assert.equal(keyWords('Tab'),true,'Tab is not consumed');
 assert.equal(win.document.getElementById('latex-suite-annotations'),null);
 inputWords();await tickWords();keyWords('Enter',{shiftKey:true});
 assert.equal(win.document.getElementById('latex-suite-annotations'),null,'Shift Enter dismisses');
 win.document.dispatchEvent(new win.CompositionEvent('compositionstart'));inputWords();await tickWords();
 assert.equal(win.document.getElementById('latex-suite-annotations'),null,'IME suppresses word popup');
 win.document.dispatchEvent(new win.CompositionEvent('compositionend'));await tickWords();
 assert.ok(win.document.getElementById('latex-suite-annotations'));
 win.document.dispatchEvent(new win.Event('latex-suite-settings-changed'));
 assert.equal(win.document.getElementById('latex-suite-annotations'),null,'reload removes popup');
 inputWords();stopWords();await tickWords();
 assert.equal(win.document.getElementById('latex-suite-annotations'),null,'cleanup cancels pending word update');
 view.dispatch(view.state.tr.delete(1,view.state.doc.content.size-1));
 view.focus();
 const stop=installMathPaste(win);
 const event = new win.Event('paste',{bubbles:true,cancelable:true});
 const text = process.argv.includes('--clipboard') ? (await exec('wl-paste',['--type','text/plain'])).stdout : '**$n$** and $1$ and \\(h(n)\\)\n\n| A | B |\n|---|---|\n| $n$ | value |\n\n- $1$\n\n\\[1\\]\n\n`$n$` and \\$1 and $5 and $10';
 Object.defineProperty(event,'clipboardData',{value:{files:[],types:['text/plain','text/html'],getData:type=>type==='text/plain'?text:'<p>Test \\(x+1\\)</p>'}});
 view.dom.dispatchEvent(event);
 assert.equal(event.defaultPrevented,true);
 const names=[];view.state.doc.descendants(node=>names.push(node.type.name));
 assert.ok(names.includes('math_inline'),JSON.stringify(view.state.doc.toJSON()));
 assert.ok(names.includes('math_display'));
 if (!process.argv.includes('--clipboard')) {
  const maths=[];view.state.doc.descendants(n=>{if(n.type.name.startsWith('math_'))maths.push(n);});
  assert.deepEqual(maths.map(n=>n.textContent),['n','1','h(n)','n','1','1']);
  assert.ok(maths[0].marks.some(m=>m.type.name==='strong'));
  assert.ok(names.includes('table'));assert.ok(names.includes('bulletList'));
  assert.ok(view.state.doc.textContent.includes('$n$ and $1 and $5 and $10'));
  const pastedDoc=view.state.doc;
  assert.ok(win.doUndo());assert.equal(view.state.doc.textContent,'');
  assert.ok(win.doRedo());assert.ok(view.state.doc.eq(pastedDoc));
 }
 if (process.argv.includes('--clipboard')) {
  assert.equal(names.filter(name=>name==='math_inline').length,(text.match(/\\\(/g)||[]).length);
  assert.equal(names.filter(name=>name==='math_display').length,(text.match(/\\\[/g)||[]).length);
 }
 stop();
 console.log('Installed Zotero editor mixed-format paste passed.');
 const stopPreview = installMathPreview(win, 0);
 const stopHighlight = installMathHighlight(win);
 const tick = () => new Promise(resolve=>win.requestAnimationFrame(()=>win.requestAnimationFrame(resolve)));
 for (const tag of ['math-inline','math-display']) {
  const node = view.dom.querySelector(tag), math = node.pmViewDesc.spec;
  const beforePreview = JSON.stringify(view.state.doc.toJSON());
  math.selectNode();math._innerView.focus();await tick();
  const panel=win.document.getElementById('latex-suite-math-preview');
  assert.ok(panel?.querySelector('.katex'),`${tag} renders preview`);
  assert.equal(panel.parentNode,tag==='math-inline'?win.document.body:node);
  assert.equal(JSON.stringify(view.state.doc.toJSON()),beforePreview,'preview does not edit note');
  if (tag==='math-inline') {
   node.getBoundingClientRect=()=>({left:20,right:120,top:200,bottom:220});
   Object.defineProperty(panel,'offsetHeight',{configurable:true,value:50});
   Object.defineProperty(panel,'offsetWidth',{configurable:true,value:150});
   const menu=win.document.createElement('div');menu.id='latex-suite-completion';
   menu.getBoundingClientRect=()=>({left:20,right:200,top:225,bottom:425});
   win.document.body.append(menu);win.dispatchEvent(new win.Event('resize'));await tick();
   assert.ok(parseFloat(panel.style.top)+50<225,'preview avoids completion menu');
   menu.remove();await tick();
   assert.equal(panel.style.top,'144px','inline preview prefers above the equation');
   node.getBoundingClientRect=()=>({left:20,right:120,top:20,bottom:40});
   win.dispatchEvent(new win.Event('resize'));await tick();
   assert.equal(panel.style.visibility,'hidden','does not flip below near viewport top');
  }
  const inner=math._innerView;
  inner.dispatch(inner.state.tr.insertText('\\left(x\\right)',0,inner.state.doc.content.size));
  rememberSelectionClass(inner);
  const matchBuffer=()=>PMBuffer.forMath(inner,tag==='math-inline'?'math_inline':'math_display');
  matchBuffer().setSelection(0);await tick();
  assert.equal(Array.from(inner.dom.querySelectorAll('.ls-tex-match')).map(el=>el.textContent).join(''),'\\left(\\right)',`${tag} live delimiter matching`);
  assert.equal(inner.state.doc.textContent,'\\left(x\\right)','matching preserves equation source');
  matchBuffer().setSelection(0,inner.state.doc.content.size);await tick();
  assert.equal(inner.dom.querySelector('.ls-tex-match'),null,'range selection removes caret matching');
  inner.dispatch(inner.state.tr.insertText('(x',0,inner.state.doc.content.size));
  matchBuffer().setSelection(0);await tick();
  assert.equal(inner.dom.querySelector('.ls-tex-unmatched')?.textContent,'(');
  inner.dispatch(inner.state.tr.insertText('x+2',0,inner.state.doc.content.size));await tick();
  assert.ok(panel.textContent.includes('2'));
  const good=panel.firstChild.innerHTML;
  inner.dispatch(inner.state.tr.insertText('\\frac{',0,inner.state.doc.content.size));await tick();
  assert.equal(inner.dom.querySelector('.ls-tex-command')?.textContent,'\\frac',`${tag} native editor uses highlight decorations`);
  assert.equal(inner.state.doc.textContent,'\\frac{','decorations do not modify source');
  inner.dom.dispatchEvent(new win.CompositionEvent('compositionstart',{bubbles:true}));
  inner.dispatch(inner.state.tr.insertText('x',inner.state.doc.content.size));
  inner.dom.dispatchEvent(new win.CompositionEvent('compositionend',{bubbles:true,data:'x'}));
  await tick();assert.equal(inner.state.doc.textContent,'\\frac{x','composition retains source');
  inner.dispatch(inner.state.tr.delete(6,7));await tick();
  assert.equal(panel.firstChild.innerHTML,good);
  assert.match(panel.textContent,/Incomplete expression/);
  inner.dispatch(inner.state.tr.insertText('x+3',0,inner.state.doc.content.size));await tick();
  assert.equal(panel.querySelector('.ls-preview-status').textContent,'');
  assert.ok(panel.textContent.includes('3'));
  clearTabstops();rememberSelectionClass(inner);
  inner.dispatch(inner.state.tr.delete(0,inner.state.doc.content.size));
  const buffer=()=>PMBuffer.forMath(inner,tag==='math-inline'?'math_inline':'math_display');
  inner.dispatch(inner.state.tr.insertText('z+\\frac{a+b}{c}',0,inner.state.doc.content.size));
  buffer().setSelection(9);
  const expandSelection=createMathSelection();
  for(const expected of ['a','a+b','\\frac{a+b}{c}','z+\\frac{a+b}{c}']) {
   assert.ok(expandSelection(buffer(),false));
   assert.equal(buffer().selectedText,expected,`${tag} native selection`);
  }
  assert.ok(expandSelection(buffer(),true));
  assert.equal(buffer().selectedText,'\\frac{a+b}{c}');
  inner.dispatch(inner.state.tr.delete(0,inner.state.doc.content.size));
  const stopAt=(index,from)=>({index:[index],from,to:from});
  expandSnippet(buffer(),0,0,{insert:'\\frac{}{}',tabstops:[stopAt(0,6),stopAt(1,8),stopAt(2,9)]});
  expandSnippet(buffer(),6,6,{insert:'^{}',tabstops:[stopAt(0,2),stopAt(1,3)]});
  expandSnippet(buffer(),8,8,{insert:'\\alpha',tabstops:[]});
  for(const expected of [15,17,18]) {
   assert.ok(setSelectionToNextTabstop(buffer(),false));
   assert.equal(inner.state.selection.to,expected,`${tag} native nested stop preserved`);
  }
  assert.equal(inner.state.doc.textContent,'\\frac{^{\\alpha}}{}');
  clearTabstops();
  math.deselectNode();view.focus();await tick();
  assert.equal(win.document.getElementById('latex-suite-math-preview'),null);
 }
 stopPreview();
 stopHighlight();
 for (const inline of [true,false]) {
  const stopSplit=installMathPreview(win,0,inline,!inline);
  for (const tag of ['math-inline','math-display']) {
   const math=view.dom.querySelector(tag).pmViewDesc.spec;
   math.selectNode();math._innerView.focus();await tick();
   assert.equal(!!win.document.getElementById('latex-suite-math-preview'),(tag==='math-inline')===inline,'independent preview toggle');
   math.deselectNode();view.focus();await tick();
  }
  stopSplit();
 }
 // Full bundle: preference reloads replace and remove the preview cleanly.
 win.__latexSuiteSettings=JSON.stringify({mathPreviewDebounceMs:0});
 win.eval(readFileSync('build/content-script.js','utf8'));
 const math=view.dom.querySelector('math-inline').pmViewDesc.spec;
 math.selectNode();math._innerView.focus();await tick();
 assert.ok(win.document.getElementById('latex-suite-math-preview'));
 assert.ok(math._innerView.dom.querySelector('.ls-tex-operator'),'full bundle highlighting enabled');
 const beforeSelectionTest=math._innerView.state.doc.textContent;
 math._innerView.dispatch(math._innerView.state.tr.insertText('z+\\left(a+b\\right)',0,math._innerView.state.doc.content.size));await tick();
 assert.equal(math._innerView.dom.querySelector('.ls-tex-boundary')?.textContent,'\\left');
 const mouseSelect=(detail,options={},type='mousedown')=>{
  const event=new win.MouseEvent(type,{detail,button:0,bubbles:true,cancelable:true,...options});
  // Exercise our document capture listener. Do not run native browser/PM
  // pointer selection on passthrough events: jsdom has no layout/hit testing,
  // and native PM may independently preventDefault on modified clicks.
  const stopNative=e=>e.stopImmediatePropagation();
  win.document.addEventListener(type,stopNative,true);
  try {math._innerView.dom.dispatchEvent(event);}
  finally {win.document.removeEventListener(type,stopNative,true);}
  return event;
 };
 // jsdom has no native double-click word selection: emulate its resulting
 // range, then exercise our real capture listener in the full plugin bundle.
 PMBuffer.forMath(math._innerView,'math_inline').setSelection(8,9);
 assert.equal(mouseSelect(1).defaultPrevented,true,'single click is custom caret selection');
 assert.equal(mouseSelect(2).defaultPrevented,true,'double click is custom word selection');
 for(const [detail,expected] of [[3,'a+b'],[4,'\\left(a+b\\right)'],[5,'z+\\left(a+b\\right)']]) {
  assert.ok(mouseSelect(detail).defaultPrevented,'structural clicks intercepted');
  assert.equal(PMBuffer.forMath(math._innerView,'math_inline').selectedText,expected);
 }
 const reported=String.raw`\mathcal{L}_{\text{SE}} := \mathbb{E}_{x \sim p_{t}} \left[ \sum_{y \neq x} w_{x y} \left( s^{\theta}(x)_{y} - \frac{p(y)}{p(x)} \log s^{\theta}(x)_{y} + K \left( \frac{p(y)}{p(x)} \right)  \right)   \right]`;
 math._innerView.dispatch(math._innerView.state.tr.insertText(reported,0,math._innerView.state.doc.content.size));
 const firstFraction=reported.indexOf('\\frac');
 PMBuffer.forMath(math._innerView,'math_inline').setSelection(firstFraction,firstFraction+5);
 assert.ok(mouseSelect(3).defaultPrevented);
 assert.equal(PMBuffer.forMath(math._innerView,'math_inline').selectedText,'\\frac{p(y)}{p(x)}');
 // Simulate a native event overwriting the chosen range; release restores it.
 PMBuffer.forMath(math._innerView,'math_inline').setSelection(0,reported.length);
 for(const type of ['mouseup','click','dblclick']) assert.ok(mouseSelect(3,{},type).defaultPrevented);
 assert.equal(PMBuffer.forMath(math._innerView,'math_inline').selectedText,'\\frac{p(y)}{p(x)}');
 assert.ok(mouseSelect(1).defaultPrevented,'continue when native click count restarts');
 assert.ok(PMBuffer.forMath(math._innerView,'math_inline').selectedText.startsWith(' s^{\\theta}(x)_{y} - \\frac'));
 assert.ok(mouseSelect(1).defaultPrevented);
 assert.ok(PMBuffer.forMath(math._innerView,'math_inline').selectedText.startsWith('\\left( s^{\\theta}'),'outside scalable parens before expanding to outer brackets');
 assert.ok(mouseSelect(1).defaultPrevented);
 assert.ok(PMBuffer.forMath(math._innerView,'math_inline').selectedText.startsWith(' \\sum_'));
 assert.equal(mouseSelect(1,{clientX:100}).defaultPrevented,true,'moving click starts custom caret selection');
 assert.equal(PMBuffer.forMath(math._innerView,'math_inline').from,PMBuffer.forMath(math._innerView,'math_inline').to);
 const scripted=String.raw`\nabla_{s^{\theta}(x)_{y}} \mathcal{L}_{\text{SE}} = \frac{1}{s^{\theta}(x)_{y}} \mathcal{L}_{\text{CSM}}`;
 math._innerView.dispatch(math._innerView.state.tr.insertText(scripted,0,math._innerView.state.doc.content.size));
 const symbol=scripted.indexOf('{L}')+1;
 PMBuffer.forMath(math._innerView,'math_inline').setSelection(symbol,symbol+1);
 for(const [detail,expected] of [[3,'{L}'],[1,'\\mathcal{L}'],[1,'\\mathcal{L}_{\\text{SE}}'],[1,scripted]]) {
  assert.ok(mouseSelect(detail).defaultPrevented);
  assert.equal(PMBuffer.forMath(math._innerView,'math_inline').selectedText,expected,'styled symbol and attached scripts form selectable term');
 }
 for(const options of [{ctrlKey:true},{altKey:true},{shiftKey:true},{metaKey:true},{button:2}]) {
  assert.equal(mouseSelect(3,options).defaultPrevented,false,'modified/right clicks untouched');
 }
 math._innerView.dom.dispatchEvent(new win.CompositionEvent('compositionstart',{bubbles:true}));
 assert.equal(mouseSelect(3).defaultPrevented,false,'composition untouched');
 math._innerView.dom.dispatchEvent(new win.CompositionEvent('compositionend',{bubbles:true}));
 const frozen={from:math._innerView.state.selection.from,to:math._innerView.state.selection.to};
 math._innerView.setProps({editable:()=>false});
 assert.equal(mouseSelect(3).defaultPrevented,false,'read-only math untouched');
 math._innerView.setProps({editable:()=>true});
 const removedShortcut=new win.KeyboardEvent('keydown',{key:'ArrowUp',ctrlKey:true,altKey:true,bubbles:true,cancelable:true});
 math._innerView.dom.dispatchEvent(removedShortcut);
 assert.equal(removedShortcut.defaultPrevented,false,'old shortcut removed');
 assert.deepEqual({from:math._innerView.state.selection.from,to:math._innerView.state.selection.to},frozen);
 math._innerView.dispatch(math._innerView.state.tr.insertText(beforeSelectionTest,0,math._innerView.state.doc.content.size));await tick();
 const sourceBeforeUndo=math._innerView.state.doc.textContent;
 // Zotero's outer history must still undo/redo edits made in the nested view.
 const {closeHistory}=await import('prosemirror-history');
 view.dispatch(closeHistory(view.state.tr));
 math._innerView.dispatch(math._innerView.state.tr.insertText(' + \\beta',math._innerView.state.doc.content.size));await tick();
 const editedSource=math._innerView.state.doc.textContent;
 math._innerView.dom.dispatchEvent(new win.KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));await tick();
 assert.equal(math._innerView.state.doc.textContent,sourceBeforeUndo,'Undo with highlighting restores source');
 math._innerView.dom.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Z',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}));await tick();
 assert.equal(math._innerView.state.doc.textContent,editedSource,'Redo with highlighting restores edit');
 const sourceBeforeHighlightToggle=math._innerView.state.doc.textContent;
 win.__latexSuiteReload(JSON.stringify({mathHighlightEnabled:false,mathPreviewDebounceMs:0}));await tick();
 assert.equal(math._innerView.dom.querySelector('.ls-tex-command'),null);
 assert.equal(math._innerView.state.doc.textContent,sourceBeforeHighlightToggle);
 win.__latexSuiteReload(JSON.stringify({mathPreviewEnabled:false}));await tick();
 assert.equal(win.document.getElementById('latex-suite-math-preview'),null);
 win.__latexSuiteReload(JSON.stringify({mathPreviewEnabled:true,mathPreviewDebounceMs:0}));await tick();
 assert.ok(win.document.getElementById('latex-suite-math-preview'));
 const nestedSnippets=String.raw`export default [
  {trigger:"mk",replacement:"\\($0\\)$1",options:"TA"},
  {trigger:";a",replacement:"\\alpha",options:"mA"},
 ];`;
 win.__latexSuiteReload(JSON.stringify({snippets:nestedSnippets,mathPreviewDebounceMs:0}));await tick();
 math._innerView.dispatch(math._innerView.state.tr.insertText('\\text{m}',0,math._innerView.state.doc.content.size));
 PMBuffer.forMath(math._innerView,'math_inline').setSelection(7);
 const nestedKey=key=>{const e=new win.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});math._innerView.dom.dispatchEvent(e);return e;};
 assert.ok(nestedKey('k').defaultPrevented,'mk expands in text macro');
 assert.equal(math._innerView.state.doc.textContent,'\\text{\\(\\)}');
 const nestedCursor=math._innerView.state.selection.from;
 math._innerView.dispatch(math._innerView.state.tr.insertText(';',nestedCursor));
 assert.ok(nestedKey('a').defaultPrevented,'math snippets work in nested math');
 assert.equal(math._innerView.state.doc.textContent,'\\text{\\(\\alpha\\)}');
 assert.ok(nestedKey('Tab').defaultPrevented,'Tab exits nested math through final tabstop');
 assert.equal(math._innerView.state.selection.from,math._innerView.state.doc.textContent.indexOf('\\)')+2,'final tabstop is after closing delimiter');
 assert.equal(Context.fromBuffer(PMBuffer.forMath(math._innerView,'math_inline')).mode.textEnv,true,'final tabstop restores text mode');
 win.__latexSuiteReload(JSON.stringify({mathPreviewDebounceMs:0}));await tick();
 const matrixSource='\\begin{array}{c}\na\n\\end{array}';
 math._innerView.dispatch(math._innerView.state.tr.insertText(matrixSource,0,math._innerView.state.doc.content.size));
 PMBuffer.forMath(math._innerView,'math_inline').setSelection(matrixSource.indexOf('\na')+2);
 const sourceNewline=new win.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true});
 math._innerView.dom.dispatchEvent(sourceNewline);
 assert.ok(sourceNewline.defaultPrevented,'Ctrl Enter handled before native math keymap');
 assert.equal(math._innerView.state.doc.textContent,matrixSource.replace('\na\n','\na\n\n'),'native math view stores a plain newline');
 assert.ok(nestedKey('Enter').defaultPrevented,'plain Enter still adds a matrix row');
 assert.ok(math._innerView.state.doc.textContent.includes(' \\\\\n'));
 assert.ok(nestedKey('Enter').defaultPrevented);
 const leaveMatrix=new win.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true});
 math._innerView.dom.dispatchEvent(leaveMatrix);
 assert.ok(leaveMatrix.defaultPrevented,'Shift Enter still leaves to next line');
 win.__latexSuiteUninstall();await tick();
 assert.equal(mouseSelect(3).defaultPrevented,false,'mouse selection listener removed on uninstall');
 assert.equal(win.document.getElementById('latex-suite-math-preview'),null);
 console.log('Installed Zotero inline/display live previews passed.');
} finally {win.close();}
