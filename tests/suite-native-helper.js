function startup(){run().catch(e=>IOUtils.writeUTF8(CONFIG.result,JSON.stringify({done:true,error:String(e),stack:e.stack})));}
function shutdown(){}
function install(){}
function uninstall(){}
async function run(){
  await Zotero.initializationPromise;await Zotero.uiReadyPromise;
  const check=(v,m)=>{if(!v)throw new Error(m);};
  await Zotero.Libraries.get(Zotero.Libraries.userLibraryID).waitForDataLoad('item');
  const item=new Zotero.Item('note');item.setNote('<div data-schema-version="9"><p>test</p></div>');await item.saveTx();
  let instance;
  if(CONFIG.sidebar){
    await Zotero.getMainWindow().ZoteroPane.selectItem(item.id);
    for(let i=0;i<100&&!instance;i++){
      instance=Zotero.Notes._editorInstances.find(e=>e.itemID===item.id);
      if(!instance)await Zotero.Promise.delay(100);
    }
    check(instance,'Sidebar editor initialized');
  }else instance=await Zotero.Notes.open(item.id,undefined,{openInWindow:true});
  const frame=instance._iframeWindow,w=frame.wrappedJSObject;
  frame.docShell.chromeEventHandler.ownerGlobal.resizeTo(1100,850);
  for(let i=0;i<100&&(!w.__tikzcdNotes||!w._currentEditorInstance?._editorCore?.view);i++)await Zotero.Promise.delay(100);
  check(w.__tikzcdNotes,'Note content integration injected');
  check(!Zotero.getMainWindow().document.getElementById('tikzcd-preview-open'),'No standalone preview menu entry');
  if(CONFIG.withLatex){for(let i=0;i<100&&!w.__latexSuite;i++)await Zotero.Promise.delay(100);check(w.__latexSuite,'LaTeX Suite also installed');}
  function inject(code){const script=frame.document.createElement('script');script.textContent=code;frame.document.head.append(script);script.remove();}
  const source=String.raw`\begin{tikzcd}
A \arrow[r,curve={height=24pt},"f"] \arrow[d,"g"'] & B \arrow[d,"h"] \\
C \arrow[r,"k"'] & D
\end{tikzcd}`;
  inject(`var v=_currentEditorInstance._editorCore.view,sc=v.state.schema;
    var diagram=sc.nodes.math_display.create(null,sc.text(${JSON.stringify(source)}));
    v.dispatch(v.state.tr.replaceWith(0,v.state.doc.content.size,[sc.nodes.paragraph.create(null,sc.text('Diagram')),diagram,sc.nodes.math_display.create(null,sc.text('a+b')),sc.nodes.paragraph.create(null,sc.nodes.math_inline.create(null,sc.text('x^2'))),sc.nodes.paragraph.create(null,sc.text('after'))]));
    var S=Object.getPrototypeOf(v.state.selection.constructor);v.dispatch(v.state.tr.setSelection(S.fromJSON(v.state.doc,{type:'text',anchor:1,head:1})));v.focus();
    window.math=document.querySelector('math-display').pmViewDesc.spec;
    window.savedBefore=JSON.stringify(v.state.doc.toJSON());
  `);
  const doc=frame.document;
  async function waitFor(fn,message){for(let i=0;i<100&&!fn();i++)await Zotero.Promise.delay(50);check(fn(),message);}
  const mainDoc=Zotero.getMainWindow().document;
  const listenerCount=type=>Zotero.Reader._registeredListeners.filter(x=>x.pluginID==='latex-suite@ievlevpn.github.io'&&x.type===type).length;
  await waitFor(()=>mainDoc.getElementById('compact-menu-button'),'Integrated Compact Menu attached');
  check(listenerCount('createViewContextMenu')===1,'One PDF Page Tools listener');
  check(listenerCount('createAnnotationContextMenu')===1,'One Annotation Backlinks listener');
  Zotero.Prefs.set('extensions.zotero.latexSuite.settings',JSON.stringify({compactMenuEnabled:false,pdfPageToolsEnabled:false,annotationBacklinksEnabled:false}),true);
  await waitFor(()=>!mainDoc.getElementById('compact-menu-button')&&listenerCount('createViewContextMenu')===0&&listenerCount('createAnnotationContextMenu')===0,'Disabled modules remove UI and listeners');
  Zotero.Prefs.set('extensions.zotero.latexSuite.settings','{}',true);
  await waitFor(()=>mainDoc.getElementById('compact-menu-button')&&listenerCount('createViewContextMenu')===1&&listenerCount('createAnnotationContextMenu')===1,'Modules re-enable without duplicates');
  await waitFor(()=>doc.querySelector('math-display .math-render .tikzcd-diagram')?.style.visibility==='','Closed diagram renders');
  check(doc.querySelectorAll('math-display .tikzcd-diagram .vertex').length===4,'Four diagram vertices');
  check(doc.querySelectorAll('math-display')[1].querySelector('.katex'),'Ordinary display math unchanged');
  check(doc.querySelector('math-inline .katex'),'Inline math unchanged');
  const surface=doc.querySelector('.tikzcd-note-surface'), diagramRoot=surface.querySelector('.tikzcd-diagram');
  check(frame.getComputedStyle(surface).backgroundColor==='rgba(0, 0, 0, 0)','Transparent surface');
  check(frame.getComputedStyle(diagramRoot).backgroundColor==='rgba(0, 0, 0, 0)','Transparent diagram');
  check(frame.getComputedStyle(surface).borderTopWidth==='0px','No preview panel border');
  const dr=diagramRoot.getBoundingClientRect(), sr=surface.getBoundingClientRect();
  check(Math.abs((dr.left+dr.right)-(sr.left+sr.right))<2,'Diagram centered');
  check(frame.getComputedStyle(diagramRoot.querySelector('.label')).fontSize==='26px','Quiver label sizing');
  const graph=diagramRoot.querySelector('.tikzcd-graph');
  const scale=new frame.DOMMatrix(frame.getComputedStyle(graph).transform).a;
  check(Math.abs(scale*26-parseFloat(frame.getComputedStyle(surface).fontSize))<0.001,'Whole diagram matches note font size');
  check(frame.getComputedStyle(surface).marginTop==='0px','No extra outer margin');
  const bounds=[...diagramRoot.querySelectorAll('.label, .arrow > svg path, .arrow > svg circle, .arrow > svg polygon, .arrow > svg line')].filter(n=>!n.closest('defs, mask, clipPath, .arrow-background, .arrow-endpoint, .invalid')).map(n=>n.getBoundingClientRect()).filter(r=>r.width||r.height);
  check(Math.abs(Math.min(...bounds.map(r=>r.left))-dr.left)<1,'No left padding');
  check(Math.abs(Math.min(...bounds.map(r=>r.top))-dr.top)<1,'No top padding');
  check(Math.abs(dr.right-Math.max(...bounds.map(r=>r.right)))<1,'No right padding');
  check(Math.abs(dr.bottom-Math.max(...bounds.map(r=>r.bottom)))<1,'No bottom padding');
  const mathNode=doc.querySelector('math-display');
  for(const color of ['rgb(230, 230, 230)','rgb(25, 25, 25)']){
    mathNode.style.color=color;
    check(frame.getComputedStyle(diagramRoot.querySelector('.vertex .label')).color===color,'Labels inherit live theme color');
    check(frame.getComputedStyle(diagramRoot.querySelector('.arrow')).color===color,'Arrows inherit live theme color');
  }
  mathNode.style.removeProperty('color');
  inject('window.savedAfter=JSON.stringify(v.state.doc.toJSON());window.serialized=JSON.stringify(getDataSync());');
  check(w.savedBefore===w.savedAfter,'Rendering did not change note document');
  check(!w.serialized.includes('tikzcd-note-surface')&&!w.serialized.includes('tikzcd-diagram'),'Generated diagram is not serialized into source');
  // Open through native pointer events, not a direct call to openEditor.
  const rect=doc.querySelector('math-display .vertex .label').getBoundingClientRect();
  frame.windowUtils.sendMouseEvent('mousedown',rect.x+rect.width/2,rect.y+rect.height/2,0,1,0);
  frame.windowUtils.sendMouseEvent('mouseup',rect.x+rect.width/2,rect.y+rect.height/2,0,1,0);
  await waitFor(()=>!!w.math._innerView,'Click opens native source editor');
  check(!doc.querySelector('math-display > .tikzcd-note-surface'),'No independent editing preview');
  if(CONFIG.withLatex){
    await waitFor(()=>doc.querySelector('#latex-suite-math-preview .tikzcd-diagram'),'Shared live preview attached');
    check(frame.getComputedStyle(doc.getElementById('latex-suite-math-preview')).display!=='none','Shared panel visible');
    check(doc.querySelectorAll('.tikzcd-note-surface').length===1,'One diagram surface only');
  }
  inject(`var inner=math._innerView;inner.dispatch(inner.state.tr.insertText('X',0+${source.indexOf('A')},${source.indexOf('A')+1}));inner.focus();`);
  await Zotero.Promise.delay(300);
  if(CONFIG.withLatex){
    await waitFor(()=>doc.querySelector('#latex-suite-math-preview .tikzcd-note-output')?.dataset.source?.includes('X \\arrow'),'Shared preview updates while editing');
  }else{
    check(!doc.querySelector('.math-render .tikzcd-note-output')?.dataset.source?.includes('X \\arrow'),'No independent live rendering');
  }
  check(w.math._innerView.state.doc.textContent.includes('X \\arrow'),'Native source edit kept');
  if(CONFIG.withLatex){
    inject(`window.__latexSuiteDiagnosePrint=html=>window.exportedHTML=html;var menu=document.createElement('div');menu.className='popup';document.querySelector('.more-dropdown').append(menu);`);
    await waitFor(()=>doc.getElementById('latex-suite-print-menu-item'),'Print action attached');
    inject(`document.getElementById('latex-suite-print-menu-item').click();`);
    await waitFor(()=>!!w.exportedHTML,'PDF snapshot prepared while source is open');
    check(w.exportedHTML.includes('tikzcd-graph'),'PDF includes diagram');
    check(w.exportedHTML.includes('clipping-mask'),'PDF preserves SVG masks');
    check(w.exportedHTML.includes('.tikzcd-diagram {'),'PDF includes renderer CSS');
    await IOUtils.writeUTF8(CONFIG.screenshot+'.html',w.exportedHTML);
  }
  // Record the editing view for visual inspection.
  const canvas=doc.createElement('canvas');canvas.width=frame.innerWidth;canvas.height=frame.innerHeight;
  canvas.getContext('2d').drawWindow(frame,0,0,canvas.width,canvas.height,'white');
  await IOUtils.write(CONFIG.screenshot,Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0)));
  // Close natively by moving the outer selection, then reopen the note.
  inject(`v.dispatch(v.state.tr.setSelection(S.fromJSON(v.state.doc,{type:'text',anchor:1,head:1})));v.focus();`);
  await waitFor(()=>!w.math._innerView&&doc.querySelector('.math-render .tikzcd-diagram'),'Closing preserves the rendered diagram');
  await waitFor(()=>doc.querySelector('.math-render .tikzcd-note-output')?.dataset.source?.includes('X \\arrow'),'Closing renders changed source');
  // Switch the same live node to ordinary source, then restore it.
  inject(`math.update(math._node.type.create(null,sc.text('a+b')));`);
  check(!doc.querySelector('math-display').hasAttribute('data-tikzcd'),'Ordinary source removes diagram routing');
  check(doc.querySelector('math-display .katex'),'Ordinary source restores KaTeX');
  inject(`math.update(diagram);`);
  await waitFor(()=>doc.querySelector('math-display .tikzcd-diagram')?.style.visibility==='','Switch back to diagram');
  const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const pref='extensions.zotero.latexSuite.settings';
  Zotero.Prefs.set(pref,JSON.stringify({tikzcdEnabled:false}),true);
  await waitFor(()=>!w.__tikzcdNotes,'Module switch disables diagrams');
  check(!doc.querySelector('.tikzcd-note-surface'),'Disable removes custom rendering');
  check(!w.__tikzcdNotes,'Disable removes content controller');
  check(doc.querySelectorAll('math-display')[1].querySelector('.katex'),'Disable leaves normal equations intact');
  Zotero.Prefs.set(pref,JSON.stringify({tikzcdEnabled:true}),true);
  await waitFor(()=>doc.querySelector('math-display .tikzcd-diagram')?.style.visibility==='','Re-enable attaches to existing editor');
  // Exercise Zotero's actual asynchronous note-focus entry point for both kinds.
  for(const type of ['math_display','math_inline']){
    inject(`var pos;v.state.doc.descendants((node,p)=>{if(node.type.name===${JSON.stringify(type)}&&node.textContent==='${type==='math_display'?'a+b':'x^2'}')pos=p;});
      v.dispatch(v.state.tr.setSelection(S.fromJSON(v.state.doc,{type:'node',anchor:pos})));
      window.focusMath=[...document.querySelectorAll('.math-node')].map(el=>el.pmViewDesc.spec).find(m=>m._innerView&&m._node.textContent==='${type==='math_display'?'a+b':'x^2'}');
      var iv=focusMath._innerView;iv.dispatch(iv.state.tr.setSelection(iv.state.selection.constructor.create(iv.state.doc,1,2)));iv.focus();`);
    await waitFor(()=>doc.getElementById('latex-suite-math-preview'),type+' preview visible');
    inject(`document.activeElement.blur();`);
    await Zotero.Promise.delay(150);
    check(doc.getElementById('latex-suite-math-preview'),type+' preview remains on blur');
    instance.focus();await Zotero.Promise.delay(150);
    check(w.focusMath._innerView.hasFocus(),type+' tab-return focuses inner editor');
    check(w.focusMath._innerView.state.selection.anchor===1&&w.focusMath._innerView.state.selection.head===2,type+' selection retained');
    check(w.focusMath._innerView.dom.contains(doc.getSelection().anchorNode),type+' DOM selection belongs to inner editor');
  }
  // Pseudocode uses the same closed/live/export surface, without altering source.
  const algorithm=String.raw`\begin{algorithm}\caption{Sum}\begin{algorithmic}\REQUIRE A sequence of values to sum\ENSURE The sum of the values\INPUT $n$\OUTPUT $s$\STATE $s \gets 0$\FOR{$i=1$ to $n$}\STATE $s \gets s+i$\COMMENT{Accumulate values}\ENDFOR\RETURN $s$\end{algorithmic}\end{algorithm}`;
  inject(`v.dispatch(v.state.tr.replaceWith(0,v.state.doc.content.size,[sc.nodes.paragraph.create(null,sc.text('Algorithm')),sc.nodes.math_display.create(null,sc.text(${JSON.stringify(algorithm)})),sc.nodes.paragraph.create(null,sc.text('after'))]));v.dispatch(v.state.tr.setSelection(S.fromJSON(v.state.doc,{type:'text',anchor:1,head:1})));v.focus();window.pseudo=document.querySelector('math-display').pmViewDesc.spec;`);
  await waitFor(()=>doc.querySelector('.math-render .ps-algorithm'),'Closed pseudocode renders');
  check(w.pseudo._node.textContent===algorithm,'Pseudocode preserves source');
  const fontMetrics={};
  for(const [name,element] of Object.entries({prose:doc.querySelector('.ProseMirror > p'),math:doc.querySelector('math-display'),algorithm:doc.querySelector('.ps-root')})) {
    const style=frame.getComputedStyle(element);fontMetrics[name]={size:style.fontSize,family:style.fontFamily};
  }
  check(doc.querySelector('.pseudocode-diagram .katex'),'Embedded math renders');
  function checkAlgorithmLeft() {
    const block=doc.querySelector('.pseudocode-diagram'), output=block.parentElement;
    check(frame.getComputedStyle(block.querySelector('.ps-root')).fontSize===frame.getComputedStyle(doc.querySelector('.ProseMirror > p')).fontSize,'Algorithm matches prose font size');
    const comment=block.querySelector('.ps-comments'), line=comment.closest('.ps-line');
    check(comment.querySelector('.ps-comment-marker annotation')?.textContent === '\\triangleright','Comment uses math triangular marker');
    check(Math.abs(comment.getBoundingClientRect().right-line.getBoundingClientRect().right)<1,'Comment is right aligned');
    check(Math.abs(block.getBoundingClientRect().left-output.getBoundingClientRect().left)<1,'Algorithm is left aligned');
    check(Math.abs(block.getBoundingClientRect().width-output.getBoundingClientRect().width)<1,'Algorithm fills available text width even for short content');
    check(Math.abs(block.querySelector('.ps-algorithm').getBoundingClientRect().width-block.getBoundingClientRect().width)<1,'Algorithm rules span the full block');
    const labels=block.querySelectorAll('.ps-algorithmic .ps-line:not(.ps-code)');
    check(labels.length===4,'All input/output labels rendered');
    for(const line of labels) {
      check(frame.getComputedStyle(line).textIndent==='0px','Input/output label has no negative indent');
      const range=doc.createRange();range.selectNodeContents(line);
      check(range.getBoundingClientRect().left>=block.getBoundingClientRect().left,'Input/output label is not clipped');
      check(Math.abs(line.getBoundingClientRect().left-block.querySelector('.ps-algorithm > .ps-line').getBoundingClientRect().left-parseFloat(frame.getComputedStyle(block.querySelector('.ps-algorithmic')).paddingLeft))<1,'Label uses body inset');
    }
  }
  checkAlgorithmLeft();
  const algorithmBox=doc.querySelector('.ps-algorithm'), caption=algorithmBox.querySelector('.ps-line');
  check(frame.getComputedStyle(caption).textIndent==='0px','Caption has no hanging indent');
  check(frame.getComputedStyle(algorithmBox).borderTopWidth==='1px','Algorithm uses thin rules');
  const captionRange=doc.createRange();captionRange.selectNodeContents(caption);
  check(captionRange.getBoundingClientRect().left>=algorithmBox.getBoundingClientRect().left,'Caption stays within rules');
  inject(`v.dispatch(v.state.tr.setSelection(S.fromJSON(v.state.doc,{type:'node',anchor:pseudo._getPos()})));`);
  await waitFor(()=>doc.querySelector('#latex-suite-math-preview .ps-algorithm'),'Shared pseudocode preview');
  inject(`var pi=pseudo._innerView;pi.dispatch(pi.state.tr.insertText('Total',${algorithm.indexOf('Sum')},${algorithm.indexOf('Sum')+3}));pi.focus();`);
  await waitFor(()=>doc.querySelector('#latex-suite-math-preview .ps-algorithm')?.textContent.includes('Total'),'Debounced pseudocode updates');
  checkAlgorithmLeft();
  canvas.getContext('2d').drawWindow(frame,0,0,canvas.width,canvas.height,'white');
  await IOUtils.write(CONFIG.screenshot.replace('.png','-pseudocode.png'),Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0)));
  inject(`window.exportedHTML=null;document.getElementById('latex-suite-print-menu-item').click();`);
  await waitFor(()=>!!w.exportedHTML,'Pseudocode export prepared');
  check(w.exportedHTML.includes('ps-algorithm')&&w.exportedHTML.includes('.pseudocode-diagram'),'Export includes pseudocode and CSS');
  Zotero.Prefs.set(pref,JSON.stringify({pseudocodeEnabled:false}),true);
  await waitFor(()=>!w.__pseudocodeNotes,'Pseudocode module disables');
  check(!doc.querySelector('.pseudocode-note-surface'),'Pseudocode cleanup');
  Zotero.Prefs.set(pref,'{}',true);
  await waitFor(()=>w.__pseudocodeNotes,'Pseudocode re-enabled');
  await IOUtils.writeUTF8(CONFIG.result,JSON.stringify({done:true,passed:true,zotero:Zotero.version,withLatex:CONFIG.withLatex,screenshot:CONFIG.screenshot,fontMetrics}));
}
