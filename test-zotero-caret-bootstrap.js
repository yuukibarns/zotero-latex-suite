// Test helper only, loaded into the disposable profile by test-zotero-caret.mjs.
function startup(){run().catch(error=>IOUtils.writeUTF8(CONFIG.result,JSON.stringify({done:true,error:String(error),stack:error.stack})));}
function shutdown(){}
function install(){}
function uninstall(){}
const report=value=>IOUtils.writeUTF8(CONFIG.result,JSON.stringify(value));
async function run(){
 await report({stage:'helper-started'});
 await Zotero.initializationPromise;
 await Zotero.uiReadyPromise;
 for(let i=0;i<100&&!Zotero.getMainWindow();i++)await Zotero.Promise.delay(100);
 for(let i=0;i<100&&!Zotero.getMainWindow()?.ZoteroPane?.itemsView?.initialized;i++)await Zotero.Promise.delay(100);
 await report({stage:'initialized',version:Zotero.version});
 const item=new Zotero.Item('note');item.setNote('<div data-schema-version="9"><p>test</p></div>');await item.saveTx();
 await report({stage:'note-created'});
 const instance=await Zotero.Notes.open(item.id,undefined,{openInWindow:true});
 const frame=instance._iframeWindow,w=frame.wrappedJSObject;
 frame.docShell.chromeEventHandler.ownerGlobal.resizeTo(1400,900);
 for(let i=0;i<100&&!w.__latexSuite;i++)await Zotero.Promise.delay(100);
 await report({stage:'editor-ready',url:w.location.href,installed:!!w.__latexSuite,clock:typeof w.performance});
 function inject(code){const s=frame.document.createElement('script');s.textContent=code;frame.document.head.append(s);s.remove();}
 const cases=[
  ...[false,true].flatMap(retarget=>[true,false].map(before=>({kind:'math_display',source:String.raw`\log d \mathbb{P}(\omega) = \sum_{k = 1}^{n} \log Q_{t_{k}} (x_{k} | x_{k - 1}) - \int_{0}^{T} \lambda_{t} (X_{t}) d t `,glyph:'l',occurrence:1,expected:[49],focused:true,before,retarget}))),
  {kind:'math_display',source:'a + b + c',glyph:'b',expected:[4,5],focused:true},
  {kind:'math_display',source:'a + b + c',glyph:'b',expected:[4,5],focused:false},
  {kind:'math_inline',source:'a + b + c',glyph:'b',expected:[4,5],focused:false},
  {kind:'math_inline',source:'12345+x',glyph:'3',expected:[3],focused:true},
  {kind:'math_inline',source:'12345+x',glyph:'3',side:'left',expected:[2],focused:true},
  {kind:'math_display',source:String.raw`\sin x+s`,glyph:'s',expected:[4],focused:true},
  {kind:'math_display',source:String.raw`\sin x+s`,glyph:'s',occurrence:1,expected:[8],focused:true},
  {kind:'math_display',source:String.raw`\alpha+α`,glyph:'α',expected:[6],focused:true},
  {kind:'math_display',source:String.raw`\alpha+α`,glyph:'α',occurrence:1,expected:[8],focused:true},
  {kind:'math_display',source:String.raw`\frac{a}{b}+c`,glyph:'b',expected:[10],focused:true},
  {kind:'math_display',source:String.raw`\sqrt{x}+y`,glyph:'x',expected:[7],focused:true},
  {kind:'math_display',source:String.raw`x_i^t+x_i`,glyph:'i',expected:[3],focused:true},
  {kind:'math_display',source:String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`,glyph:'d',expected:[23],focused:true},
  {kind:'math_display',source:String.raw`\text{hello}+x`,glyph:'l',expected:[9],focused:true},
  {kind:'math_display',source:'a+'+' '.repeat(2100)+'b+c',glyph:'b',expected:[2103],focused:true},
  {kind:'math_display',source:String.raw`d\mathbb{P}(\omega)=\left(\prod_{i=1}^{n}Q_{t_i}(x_i|x_{i-1})\right)\exp\left(-\int_0^T\lambda_t(X_t)dt\right)`,glyph:'i',occurrence:3,expected:[56,57],focused:false},
 ];
 const slowSource=String.raw`\alpha+\beta+\gamma+\delta+\epsilon+\zeta+\eta+\theta+\iota+\kappa+\lambda+\mu+\nu+\xi+\pi+\rho+\omega`;
 cases.push({kind:'math_display',source:slowSource,glyph:'ρ',expected:[slowSource.indexOf('\\rho'),slowSource.indexOf('\\rho')+4],focused:true,slowProbe:true});
 const results=[];
 if(CONFIG.reportedOnly)cases.splice(4);
 inject(`for(var type of ['pointerdown','mousedown','mouseup','click','selectionchange','focusin'])addEventListener(type,e=>{if(window.nativeTrace)nativeTrace.push({event:e.type,ms:Date.now()-window.testStarted,trusted:e.isTrusted,target:e.target.nodeName,inner:!!window.testMath?._innerView,selection:window._currentEditorInstance._editorCore.view.state.selection.constructor.name});},true);`);
 for(const test of cases){
 inject(`
  var v=window._currentEditorInstance._editorCore.view,sc=v.state.schema;
  var mathNode=sc.nodes.${test.kind}.create(null,sc.text(${JSON.stringify(test.source)}));
  v.dispatch(v.state.tr.replaceWith(0,v.state.doc.content.size,[sc.nodes.paragraph.create(null,sc.text('before')),${test.kind==='math_inline'?'sc.nodes.paragraph.create(null,mathNode)':'mathNode'},sc.nodes.paragraph.create(null,sc.text('after'))]));
  var S=Object.getPrototypeOf(v.state.selection.constructor),initial=${test.before?'1':'v.state.doc.content.size-2'};v.dispatch(v.state.tr.setSelection(S.fromJSON(v.state.doc,{type:'text',anchor:initial,head:initial})));v.focus();
  window.testMath=document.querySelector('.math-node').pmViewDesc.spec;
  window.nativeTrace=[];window.testStarted=Date.now();window.firstPaintHead=null;
  for(var name of ['selectNode','openEditor']){let original=testMath[name],label=name;testMath[name]=function(...args){nativeTrace.push({event:label+'-start',ms:Date.now()-testStarted});let result=original.apply(this,args);nativeTrace.push({event:label+'-end',ms:Date.now()-testStarted,head:this._innerView?.state.selection.head});return result;};}
 `);
 if(test.slowProbe)inject(`{let render=testMath.renderMath;testMath.renderMath=function(...args){if(this!==window.testMath){let until=Date.now()+6;while(Date.now()<until){}}return render.apply(this,args);};}`);
 let focusButton;
 if(!test.focused){const main=Zotero.getMainWindow();focusButton=main.document.createXULElement('button');main.document.documentElement.append(focusButton);focusButton.focus();}
 await Zotero.Promise.delay(300);
 inject(`window.testPoint=null;var walker=document.createTreeWalker(testMath._mathRenderElt.querySelector('.katex-html'),4),n,remaining=${test.occurrence||0};while(n=walker.nextNode()){var p=n.textContent.indexOf(${JSON.stringify(test.glyph)});if(p>=0&&remaining--===0){var r=document.createRange();r.setStart(n,p);r.setEnd(n,p+1);var b=r.getBoundingClientRect(),leaf=n.parentElement.getBoundingClientRect();window.testPoint={x:${test.side==='left'?'b.left+1':'b.right-1'},y:(leaf.top+leaf.bottom)/2};break;}}`);
 const point=w.testPoint;
 if(point.x<0||point.x>=w.innerWidth||point.y<0||point.y>=w.innerHeight)throw new Error('Test glyph is outside the viewport');
 await report({stage:'click-point',kind:test.kind,focused:w.document.hasFocus(),x:point.x,y:point.y});
 frame.windowUtils.sendMouseEvent('mousemove',point.x,point.y,0,0,0);
 frame.windowUtils.sendMouseEvent('mousedown',point.x,point.y,0,1,0);
 if(CONFIG.holdMs)await Zotero.Promise.delay(CONFIG.holdMs);
 // Exercise Gecko retargeting without moving the pointer. Native PM still
 // owns opening; no synthetic call to selectNode/openEditor is made here.
 if(test.retarget)inject(`testMath.dom.style.pointerEvents='none';`);
 frame.windowUtils.sendMouseEvent('mouseup',point.x,point.y,0,1,0);
 if(test.retarget)inject(`testMath.dom.style.pointerEvents='';`);
 inject(`requestAnimationFrame(()=>{window.firstPaintHead=testMath._innerView?.state.selection.head;});`);
 await Zotero.Promise.delay(1000);
 const head=w.testMath._innerView?.state.selection.head;
 const plugin=JSON.parse(w.JSON.stringify(w.__latexSuiteMathCaretDiagnostic));
 const retargetVerified=!test.retarget||plugin.events.some(e=>e.stage==='mouseup'&&e.inside===false&&e.dx===0&&e.dy===0);
 results.push({kind:test.kind,focused:test.focused,glyph:test.glyph,retarget:!!test.retarget,head,firstPaintHead:w.firstPaintHead,passed:retargetVerified&&test.expected.includes(head)&&test.expected.includes(w.firstPaintHead),native:JSON.parse(w.JSON.stringify(w.nativeTrace)),plugin});
 await report({stage:'click-result',result:{...results.at(-1),native:undefined}});
 if(test.kind==='math_display' && ['a + b + c',String.raw`\frac{a}{b}+c`,String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`].includes(test.source)) {
  inject(`var inner=testMath._innerView;inner.dispatch(inner.state.tr.setSelection(inner.state.selection.constructor.create(inner.state.doc,0)));inner.focus();document.dispatchEvent(new Event('selectionchange'));`);
  await Zotero.Promise.delay(200);
  inject(`window.previewPoint=null;var root=document.querySelector('#latex-suite-math-preview .katex-html');if(root){var walker=document.createTreeWalker(root,4),n;while(n=walker.nextNode()){if(n.textContent===${JSON.stringify(test.glyph)}){var r=document.createRange();r.selectNodeContents(n);var b=r.getBoundingClientRect(),leaf=n.parentElement.getBoundingClientRect();window.previewPoint={x:b.right-1,y:(leaf.top+leaf.bottom)/2};break;}}}`);
  const p=w.previewPoint;
  if(!p)throw new Error('Preview glyph missing');
  frame.windowUtils.sendMouseEvent('mousemove',p.x,p.y,0,0,0);
  frame.windowUtils.sendMouseEvent('mousedown',p.x,p.y,0,1,0);
  frame.windowUtils.sendMouseEvent('mouseup',p.x,p.y,0,1,0);
  const previewHead=w.testMath._innerView?.state.selection.head;
  results.push({preview:true,source:test.source,head:previewHead,passed:test.expected.includes(previewHead)});
  await report({stage:'preview-click-result',result:results.at(-1)});
  if(test.source==='a + b + c') {
   await Zotero.Promise.delay(200);
   inject(`window.dragPoints=[];for(var letter of ['b','a']){var root=document.querySelector('#latex-suite-math-preview .katex-html'),walker=document.createTreeWalker(root,4),n;while(n=walker.nextNode()){if(n.textContent===letter){var r=document.createRange();r.selectNodeContents(n);var b=r.getBoundingClientRect(),leaf=n.parentElement.getBoundingClientRect();dragPoints.push({x:letter==='b'?b.right-1:b.left+1,y:(leaf.top+leaf.bottom)/2});break;}}}`);
   const [b,a]=w.dragPoints;
   frame.windowUtils.sendMouseEvent('mousedown',b.x,b.y,0,1,0);
   frame.windowUtils.sendMouseEvent('mousemove',a.x,a.y,0,0,0);
   frame.windowUtils.sendMouseEvent('mouseup',a.x,a.y,0,1,0);
   await Zotero.Promise.delay(100);
   const sel=w.testMath._innerView.state.selection;
   const boxes=frame.document.querySelectorAll('.ls-preview-selection span').length;
   results.push({previewDrag:true,anchor:sel.anchor,head:sel.head,boxes,passed:sel.anchor===5&&sel.head===0&&boxes===3});
   await report({stage:'preview-drag-result',result:results.at(-1)});
  }
 }
 focusButton?.remove();
 }
 await report({done:true,results:results.map(r=>({...r,native:r.passed?undefined:r.native})),error:results.some(r=>!r.passed)?'Caret placement failed':null});
}
