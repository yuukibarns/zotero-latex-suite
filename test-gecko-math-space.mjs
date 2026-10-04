// Real Gecko input against the installed Zotero editor, using a disposable
// Firefox profile. No user Zotero data/profile and no synthetic DOM input.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const profile=await mkdtemp(path.join(tmpdir(),'latex-suite-gecko-space-'));
const archive=process.env.ZOTERO_ARCHIVE||'/usr/lib/zotero/app/omni.ja';
const assets=new Map();
for(const file of ['resource/react.js','resource/react-dom.js','resource/prop-types.js','resource/note-editor/editor.js','resource/note-editor/editor.css'])assets.set('/'+file,execFileSync('unzip',['-p',archive,file],{maxBuffer:20*1024*1024}));
for(const file of execFileSync('unzip',['-Z1',archive],{encoding:'utf8'}).split('\n').filter(f=>f.startsWith('resource/note-editor/assets/fonts/')&&f.endsWith('.woff2')))assets.set('/'+file,execFileSync('unzip',['-p',archive,file]));
assets.set('/plugin.js',await readFile('build/content-script.js'));
const html='<!doctype html><script>window.testErrors=[];addEventListener("error",e=>testErrors.push(e.message));</script><link rel="stylesheet" href="/resource/note-editor/editor.css"><div id="editor-container"></div>'+['resource/react.js','resource/react-dom.js','resource/prop-types.js','resource/note-editor/editor.js'].map(s=>`<script src="/${s}"></script>`).join('');
const iframe=process.argv.includes('--iframe');
const server=createServer((req,res)=>{
 const asset=assets.get(req.url);
 res.setHeader('Content-Type',(asset?(req.url.endsWith('.woff2')?'font/woff2':req.url.endsWith('.css')?'text/css':'application/javascript'):'text/html')+';charset=utf-8');res.end(asset||(iframe&&req.url==='/'?'<iframe src="/editor" style="position:absolute;left:40px;top:60px;width:900px;height:650px;border:0"></iframe>':html));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`;
// Reserve an unused loopback port for our own Marionette server.
const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));
const port=reservation.address().port;await new Promise(r=>reservation.close(r));
await writeFile(path.join(profile,'user.js'),`user_pref("marionette.port",${port});\nuser_pref("browser.shell.checkDefaultBrowser",false);\n`);
let browser,socket,buffer=Buffer.alloc(0),sequence=0;
const pending=new Map();let stderr='';
function receive(chunk){
 buffer=Buffer.concat([buffer,chunk]);
 while(true){
  const colon=buffer.indexOf(58);if(colon<0)return;
  const length=Number(buffer.subarray(0,colon));if(buffer.length<colon+1+length)return;
  const packet=JSON.parse(buffer.subarray(colon+1,colon+1+length));buffer=buffer.subarray(colon+1+length);
  if(Array.isArray(packet)){
   const item=pending.get(packet[1]);if(!item)continue;pending.delete(packet[1]);clearTimeout(item.timer);
   if(packet[2])item.reject(new Error(JSON.stringify(packet[2])));else item.resolve(packet[3]);
  }
 }
}
function command(name,params={}){
 return new Promise((resolve,reject)=>{
  const id=++sequence,body=JSON.stringify([0,id,name,params]);
  const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Marionette timeout: ${name}`));},15000);
  pending.set(id,{resolve,reject,timer});socket.write(`${Buffer.byteLength(body)}:${body}`);
 });
}
const js=script=>command('WebDriver:ExecuteScript',{script,args:[],newSandbox:false,sandbox:null}).then(r=>r?.value ?? r);
async function type(text){
 await command('WebDriver:PerformActions',{actions:[{type:'key',id:'keyboard',actions:Array.from(text).flatMap(value=>[{type:'keyDown',value},{type:'keyUp',value}])}]});
 await pause(120);
}
async function fixture(kind,plugin,config={}){
 await command('WebDriver:Navigate',{url});
 if(iframe)await command('WebDriver:SwitchToFrame',{id:0});
 await js(`window.postMessage({instanceID:'space-test',message:{action:'init',value:'<div data-schema-version="9"><p></p></div>',font:{fontFamily:'sans-serif',fontSize:14},dir:'ltr',viewMode:'library',readOnly:false}},'*');`);
	for(let i=0;i<40;i++){if(await js('return !!window._currentEditorInstance?._editorCore?.view'))break;await pause(50);}
	assert.equal(await js('return !!window._currentEditorInstance?._editorCore?.view'),true,JSON.stringify(await js('return window.testErrors')));
 if(plugin){
  await js(`window.__latexSuiteSettings=JSON.stringify(${JSON.stringify({snippetsEnabled:false,mathPreviewDebounceMs:0,...config})});var s=document.createElement('script');s.src='/plugin.js';document.head.append(s);`);
  for(let i=0;i<40;i++){if(await js('return !!window.__latexSuiteInstalled'))break;await pause(50);}
 }
 await js(`var v=window._currentEditorInstance._editorCore.view,sc=v.state.schema;var n=sc.nodes.${kind}.create(null,sc.text('x'));var content=${kind==='math_inline'?'sc.nodes.paragraph.create(null,n)':'n'};v.dispatch(v.state.tr.replaceWith(0,v.state.doc.content.size,content));var S=Object.getPrototypeOf(v.state.selection.constructor);v.dispatch(v.state.tr.setSelection(S.fromJSON(v.state.doc,{type:'node',anchor:${kind==='math_inline'?1:0}})));window.testMath=document.querySelector('.math-node').pmViewDesc.spec;var inner=window.testMath._innerView;inner.dispatch(inner.state.tr.setSelection(inner.state.selection.constructor.create(inner.state.doc,1)));inner.focus();`);
 await pause(120);
 return js(`return {whiteSpace:getComputedStyle(testMath._innerView.dom).whiteSpace,spans:testMath._innerView.dom.querySelectorAll('[class*=ls-tex]').length}`);
}
try{
 browser=spawn(process.env.FIREFOX_BINARY||'firefox',['--headless','--no-remote','--profile',profile,'--marionette','about:blank'],{stdio:['ignore','ignore','pipe']});
 browser.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-3000);});
 browser.on('error',e=>{stderr+=e.message;});
 for(let i=0;i<100;i++){
  try{socket=await new Promise((resolve,reject)=>{const s=net.connect(port,'127.0.0.1');s.once('connect',()=>resolve(s));s.once('error',reject);});break;}catch{if(browser.exitCode!==null)throw new Error(stderr);await pause(100);}
 }
 if(!socket)throw new Error('Firefox did not start: '+stderr);
 socket.on('data',receive);await command('WebDriver:NewSession',{capabilities:{alwaysMatch:{acceptInsecureCerts:true}}});
 const results=[];
 for(const [label,kind,plugin,config] of [
  ['native-inline','math_inline',false,{}],
  ['plugin-inline','math_inline',true,{}],
  ['plugin-inline-highlight-only-option','math_inline',true,{completionEnabled:false,inlineMathPreviewEnabled:false}],
  ['plugin-inline-no-highlight','math_inline',true,{mathHighlightEnabled:false}],
  ['plugin-inline-no-completion','math_inline',true,{mathHighlightEnabled:false,completionEnabled:false}],
  ['plugin-inline-no-preview','math_inline',true,{mathHighlightEnabled:false,inlineMathPreviewEnabled:false}],
  ['plugin-inline-all-optional-off','math_inline',true,{mathHighlightEnabled:false,completionEnabled:false,inlineMathPreviewEnabled:false}],
  ['native-display','math_display',false,{}],
  ['plugin-display','math_display',true,{}],
 ].filter(() => !process.argv.includes('--caret-only'))){
  const before=await fixture(kind,plugin,config);
  await type(' ');
  const trailing=await js(`return {source:testMath._innerView.state.doc.textContent,dom:testMath._innerView.dom.textContent}`);
  await type('+ y ');
  const result=await js(`return {source:testMath._innerView.state.doc.textContent,dom:testMath._innerView.dom.textContent}`);
  results.push({label,...before,trailing,...result});console.log(JSON.stringify(results.at(-1)));
  const reported=String.raw`\sin^{2}x + \cos^{2} x _{2}`;
  await js(`var v=testMath._innerView;v.dispatch(v.state.tr.insertText('',0,v.state.doc.content.size));v.focus();`);
  await type(reported);
  console.log(JSON.stringify({label,formula:await js('return testMath._innerView.state.doc.textContent'),spans:await js("return testMath._innerView.dom.querySelectorAll('[class*=ls-tex]').length")}));
  if(!process.argv.includes('--investigate'))assert.equal(await js('return testMath._innerView.state.doc.textContent'),reported,`${label}: source must preserve typed ASCII spaces`);
  if(kind==='math_display'){
   assert.equal(trailing.source,'x ','typed trailing Space is ASCII');
   assert.equal(result.source,'x + y ','repeated typing keeps ASCII spaces');
   assert.equal(result.dom,result.source);
   // Test normal typing and text-mode spaces under the whole plugin too.
   const value=String.raw`\sin^{2}x + \cos^{2} x _{2}`;
   await js(`var v=testMath._innerView;v.dispatch(v.state.tr.insertText('',0,v.state.doc.content.size));v.focus();`);
   await type(value);
   assert.equal(await js('return testMath._innerView.state.doc.textContent'),value,'reported equation remains byte-for-byte ASCII');
   await type(String.raw` + \text{hello world}`);
   assert.equal(await js('return testMath._innerView.state.doc.textContent'),value+String.raw` + \text{hello world}`,'text-mode spaces untouched');
  }
 }
 for(const [kind,source,glyph,expected,side,movement,occurrence=0] of [
  ['math_inline','a+b','b',[2,3]],
  ['math_display',String.raw`d\mathbb{P}(\omega)=\left(\prod_{i=1}^{n}Q_{t_i}(x_i|x_{i-1})\right)\exp\left(-\int_0^T\lambda_t(X_t)dt\right)`,'Q',[41,42]],
  ['math_display',String.raw`d\mathbb{P}(\omega)=\left(\prod_{i=1}^{n}Q_{t_i}(x_i|x_{i-1})\right)\exp\left(-\int_0^T\lambda_t(X_t)dt\right)`,'i',[56,57],null,false,3],
  ['math_inline','a + b + c','b',[4,5],null,true],
  ['math_inline','a+b+c+d+e+f+g+h+i+j+k+l+m+n+o+p+q+r+s+t+u+v+w+x+y+z','m',[24,25]],
  ['math_display',String.raw`\mathcal{L}_{\text{SE}} = \mathbb{E}_{x \sim p_t}\left[\sum_{y \neq x}w_{xy}\left(s^\theta(x)_y-\frac{p(y)}{p(x)}\log s^\theta(x)_y+K\right)\right]`,'K',[132,133]],
  ['math_inline','a+b','a',[0,1]],
  ['math_inline','a+b','a',[0],'left'],
  ['math_display',String.raw`x^{2}+y`,'2',[3],'left'],
  ['math_inline',String.raw`\alpha+x`,'α',[0,6]],
  ['math_display',String.raw`\mathbb{E}+x`,'E',[8,9]],
  ['math_display',String.raw`\frac{a}{b}+c`,'b',[9,10]],
  ['math_display',String.raw`x^{2}+y`,'2',[3,4]],
  ['math_display',String.raw`x_{i}^{t}+z`,'i',[3,4]],
  ['math_display',String.raw`\sqrt{x}+y`,'x',[6,7]],
  ['math_display',String.raw`\begin{pmatrix}a & b \\ c & d\end{pmatrix}`,'d',[28,29]],
 ]){
  await fixture(kind,true);
  await js(`var inner=testMath._innerView;inner.dispatch(inner.state.tr.insertText(${JSON.stringify(source)},0,inner.state.doc.content.size));var v=window._currentEditorInstance._editorCore.view;v.dispatch(v.state.tr.insert(v.state.doc.content.size,v.state.schema.nodes.paragraph.create(null,v.state.schema.text('after'))));var S=Object.getPrototypeOf(v.state.selection.constructor);v.dispatch(v.state.tr.setSelection(S.fromJSON(v.state.doc,{type:'text',anchor:v.state.doc.content.size-2,head:v.state.doc.content.size-2})));v.focus();`);
  await pause(150);
  assert.equal(await js('return !!testMath._innerView'),false,'fixture closes math');
  const point=await js(`var walker=document.createTreeWalker(testMath._mathRenderElt.querySelector('.katex-html'),4),n,remaining=${occurrence};while(n=walker.nextNode()){var p=n.textContent.indexOf(${JSON.stringify(glyph)});if(p>=0&&remaining--===0){var r=document.createRange();r.setStart(n,p);r.setEnd(n,p+1);var b=r.getBoundingClientRect(),v=n.parentElement.getBoundingClientRect();return {x:${side==='left'?'b.left+1':'b.right-1'},y:(v.top+v.bottom)/2};}}throw Error('glyph missing');`);
  await js(`window.caretTrace=[];var start=performance.now();for(var name of ['mousedown','mouseup','click','blur','focus'])addEventListener(name,e=>caretTrace.push({event:e.type,ms:performance.now()-start,head:testMath._innerView?.state.selection.head}),true);var open=testMath.openEditor;testMath.openEditor=function(){caretTrace.push({event:'open-start',ms:performance.now()-start});var r=open.apply(this,arguments);caretTrace.push({event:'open-end',ms:performance.now()-start});return r;};`);
  await command('WebDriver:PerformActions',{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',x:Math.round(point.x),y:Math.round(point.y),duration:0},{type:'pointerDown',button:0},...(movement?[{type:'pointerMove',x:Math.round(point.x)+1,y:Math.round(point.y),duration:60}]:[]),{type:'pointerUp',button:0}]}]});
  await pause(1000);
  const result=await js('return {source:testMath._innerView?.state.doc.textContent,head:testMath._innerView?.state.selection.head,probes:document.querySelectorAll(\'.math-node[aria-hidden="true"]\').length}');
  console.log('caret',JSON.stringify({kind,source,glyph,...result}));
  if(process.argv.includes('--timings')||!expected.includes(result.head)) console.log(JSON.stringify(await js('return {native:caretTrace,plugin:window.__latexSuiteMathCaretDiagnostic}')));
  assert.equal(result.source,source,'click does not change source');
  assert.ok(expected.includes(result.head),`click ${glyph} maps to its source: ${result.head}, expected ${expected}`);
  assert.equal(result.probes,0,'probe cleanup');
 }
 console.log(process.argv.includes('--investigate')?'Real Gecko Space insertion comparison completed.':'Real Gecko Space insertion and rendered click regression checks passed.');
}finally{
 socket?.destroy();for(const item of pending.values()){clearTimeout(item.timer);item.reject(new Error('test ended'));}pending.clear();
 if(browser&&browser.exitCode===null){browser.kill('SIGTERM');await Promise.race([new Promise(r=>browser.once('exit',r)),pause(2000)]);if(browser.exitCode===null)browser.kill('SIGKILL');}
 await new Promise(r=>server.close(r));
 await rm(profile,{recursive:true,force:true});
}
