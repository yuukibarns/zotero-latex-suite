// Optional integration test against the installed Zotero bundle (no user profile).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { installMathPaste } from './build/test-exports.mjs';
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
} finally {win.close();}
