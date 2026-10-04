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
 inject(`for(var type of ['pointerdown','mousedown','mouseup','click','selectionchange','focusin'])addEventListener(type,e=>{if(window.nativeTrace)nativeTrace.push({event:e.type,ms:Date.now()-window.testStarted,trusted:e.isTrusted,target:e.target.nodeName,inner:!!window.testMath?._innerView,selection:window._currentEditorInstance._editorCore.view.state.selection.constructor.name});},true);`);
 for(const test of cases){
 inject(`
  var v=window._currentEditorInstance._editorCore.view,sc=v.state.schema;
  var mathNode=sc.nodes.${test.kind}.create(null,sc.text(${JSON.stringify(test.source)}));
  v.dispatch(v.state.tr.replaceWith(0,v.state.doc.content.size,[sc.nodes.paragraph.create(null,sc.text('before')),${test.kind==='math_inline'?'sc.nodes.paragraph.create(null,mathNode)':'mathNode'},sc.nodes.paragraph.create(null,sc.text('after'))]));
  var S=Object.getPrototypeOf(v.state.selection.constructor);v.dispatch(v.state.tr.setSelection(S.fromJSON(v.state.doc,{type:'text',anchor:v.state.doc.content.size-2,head:v.state.doc.content.size-2})));v.focus();
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
 frame.windowUtils.sendMouseEvent('mouseup',point.x,point.y,0,1,0);
 inject(`requestAnimationFrame(()=>{window.firstPaintHead=testMath._innerView?.state.selection.head;});`);
 await Zotero.Promise.delay(1000);
 const head=w.testMath._innerView?.state.selection.head;
 results.push({kind:test.kind,focused:test.focused,glyph:test.glyph,head,firstPaintHead:w.firstPaintHead,passed:test.expected.includes(head)&&test.expected.includes(w.firstPaintHead),native:JSON.parse(w.JSON.stringify(w.nativeTrace)),plugin:JSON.parse(w.JSON.stringify(w.__latexSuiteMathCaretDiagnostic))});
 await report({stage:'click-result',result:{...results.at(-1),native:undefined}});
 focusButton?.remove();
 }
 await report({done:true,results:results.map(r=>({...r,native:undefined})),error:results.some(r=>!r.passed)?'Caret placement failed':null});
}
