// Optional integration test against the installed Zotero bundle (no user profile).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { installMathPaste, installMathPreview } from './build/test-exports.mjs';
const archive = process.env.ZOTERO_ARCHIVE || '/usr/lib/zotero/app/omni.ja';
const dom = new JSDOM('<!doctype html><div id="editor-container"></div>', {runScripts:'outside-only', pretendToBeVisual:true, url:'https://example.invalid/'});
const win = dom.window;
win.matchMedia = () => ({matches:false,addEventListener(){},removeEventListener(){}});
win.Range.prototype.getClientRects = () => [];
win.Range.prototype.getBoundingClientRect = () => ({left:0,right:0,top:0,bottom:0});
try {
 for (const path of ['resource/react.js','resource/react-dom.js','resource/prop-types.js','resource/note-editor/editor.js']) {
  win.eval(execFileSync('unzip',['-p',archive,path],{maxBuffer:20*1024*1024}).toString());
 }
 win.dispatchEvent(new win.MessageEvent('message',{data:{instanceID:'test',message:{action:'init',value:'<div data-schema-version="9"><p></p></div>',font:{fontFamily:'sans-serif',fontSize:14},dir:'ltr',viewMode:'library',readOnly:false}}}));
 await new Promise(resolve=>setTimeout(resolve,100));
 const view = win._currentEditorInstance._editorCore.view;
 view.focus();
 const stop=installMathPaste(win);
 const event = new win.Event('paste',{bubbles:true,cancelable:true});
 const text = process.argv.includes('--clipboard') ? execFileSync('wl-paste',['--type','text/plain']).toString() : 'Test \\(x+1\\) and\n\\[y+1\\]';
 Object.defineProperty(event,'clipboardData',{value:{files:[],types:['text/plain','text/html'],getData:type=>type==='text/plain'?text:'<p>Test \\(x+1\\)</p>'}});
 view.dom.dispatchEvent(event);
 assert.equal(event.defaultPrevented,true);
 const names=[];view.state.doc.descendants(node=>names.push(node.type.name));
 assert.ok(names.includes('math_inline'),JSON.stringify(view.state.doc.toJSON()));
 assert.ok(names.includes('math_display'));
 if (process.argv.includes('--clipboard')) {
  assert.equal(names.filter(name=>name==='math_inline').length,(text.match(/\\\(/g)||[]).length);
  assert.equal(names.filter(name=>name==='math_display').length,(text.match(/\\\[/g)||[]).length);
 }
 stop();
 console.log('Installed Zotero editor mixed-format paste passed.');
 const stopPreview = installMathPreview(win, 0);
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
   win.document.body.append(menu);await tick();
   assert.ok(parseFloat(panel.style.top)+50<225,'preview avoids completion menu');
   menu.remove();await tick();
   assert.equal(panel.style.top,'144px','inline preview prefers above the equation');
   node.getBoundingClientRect=()=>({left:20,right:120,top:20,bottom:40});
   win.dispatchEvent(new win.Event('resize'));await tick();
   assert.equal(panel.style.visibility,'hidden','does not flip below near viewport top');
  }
  const inner=math._innerView;
  inner.dispatch(inner.state.tr.insertText('x+2',0,inner.state.doc.content.size));await tick();
  assert.ok(panel.textContent.includes('2'));
  const good=panel.firstChild.innerHTML;
  inner.dispatch(inner.state.tr.insertText('\\frac{',0,inner.state.doc.content.size));await tick();
  assert.equal(panel.firstChild.innerHTML,good);
  assert.match(panel.textContent,/Incomplete expression/);
  inner.dispatch(inner.state.tr.insertText('x+3',0,inner.state.doc.content.size));await tick();
  assert.equal(panel.querySelector('.ls-preview-status').textContent,'');
  assert.ok(panel.textContent.includes('3'));
  math.deselectNode();view.focus();await tick();
  assert.equal(win.document.getElementById('latex-suite-math-preview'),null);
 }
 stopPreview();
 // Full bundle: preference reloads replace and remove the preview cleanly.
 win.__latexSuiteSettings=JSON.stringify({mathPreviewDebounceMs:0});
 win.eval(readFileSync('build/content-script.js','utf8'));
 const math=view.dom.querySelector('math-inline').pmViewDesc.spec;
 math.selectNode();math._innerView.focus();await tick();
 assert.ok(win.document.getElementById('latex-suite-math-preview'));
 win.__latexSuiteReload(JSON.stringify({mathPreviewEnabled:false}));await tick();
 assert.equal(win.document.getElementById('latex-suite-math-preview'),null);
 win.__latexSuiteReload(JSON.stringify({mathPreviewEnabled:true,mathPreviewDebounceMs:0}));await tick();
 assert.ok(win.document.getElementById('latex-suite-math-preview'));
 win.__latexSuiteUninstall();await tick();
 assert.equal(win.document.getElementById('latex-suite-math-preview'),null);
 console.log('Installed Zotero inline/display live previews passed.');
} finally {win.close();}
