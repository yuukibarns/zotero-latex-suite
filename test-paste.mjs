import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {Schema, Slice, Fragment} from 'prosemirror-model';
import {EditorState, TextSelection} from 'prosemirror-state';
import {history, undo, redo} from 'prosemirror-history';
import { normalizeMathPaste as normalize, installMathPaste, mathPasteTransaction } from './build/test-exports.mjs';
assert.equal(normalize(String.raw`Let \(x+1\) be positive.`), 'Let $x+1$ be positive.');
assert.equal(normalize(String.raw`\[\frac{a}{b}\]`), '\n\n$$\n\\frac{a}{b}\n$$\n\n');
for (const literal of [String.raw`\(unfinished`,String.raw`\\(escaped\\)`,String.raw`$\(x\)$`,String.raw`\$5`,String.raw`    \(code\)`, '`\\(code\\)`', '```tex\n\\[code\\]\n```', '~~~\n\\(code\\)\n~~~']) {
 assert.equal(normalize(literal),literal);
}
const table = '| A | B |\n|---|---|\n| \\(x\\) | 2 |';
assert.equal(normalize(table),'| A | B |\n|---|---|\n| $x$ | 2 |');
assert.equal(normalize('```\n\\(x\\)\n```\n\\(y\\)'), '```\n\\(x\\)\n```\n$y$');

const dom = new JSDOM('<div contenteditable="true" tabindex="0"></div>');
const win = dom.window, el = win.document.querySelector('div'); el.focus();
let pasted = null, code = false, succeeds = true;
const schema=new Schema({nodes:{doc:{content:'block+'},paragraph:{group:'block',content:'inline*',get code(){return code;}},text:{group:'inline'},math_inline:{group:'inline',inline:true,atom:true,content:'text*'},math_display:{group:'block',atom:true,content:'text*'}}});
const parser={insertMarkdown(text){
 pasted=text;if(!succeeds)return false;
 const blocks=text.trim().split(/\n\s*\n/).map(s=>schema.nodes.paragraph.create(null,schema.text(s)));
 this.view.dispatch(this.view.state.tr.replaceSelection(new Slice(Fragment.from(blocks),0,0)));return true;
}};
const {Plugin}=await import('prosemirror-state');
const plugin=new Plugin({state:{init:()=>parser,apply:(_,v)=>v}});
const view={dom:el,editable:true,state:null,dispatch(tr){this.state=this.state.apply(tr);}};
parser.view=view;
function reset(){view.state=EditorState.create({schema,plugins:[history(),plugin]});}
reset();
const math=()=>{const result=[];view.state.doc.descendants(n=>{if(n.type.name.startsWith('math_'))result.push([n.type.name,n.textContent]);});return result;};
win._currentEditorInstance = {_editorCore:{view}};
const stop = installMathPaste(win);
function paste(text,html='',extra={}) {
 pasted=null;
 reset();
 const e=new win.Event('paste',{bubbles:true,cancelable:true});
 Object.defineProperty(e,'clipboardData',{value:{files:[],types:['text/plain'],getData:type=>type==='text/plain'?text:type==='text/html'?html:'',...extra}});
 el.dispatchEvent(e);return e;
}
assert.equal(paste(table).defaultPrevented,true);assert.deepEqual(math(),[['math_inline','x']]);
assert.equal(paste('normal text').defaultPrevented,false);
const browserTypes = ['text/plain','text/plain;charset=utf-8','UTF8_STRING','chromium/x-internal-source-rfh-token','TEXT','chromium/x-source-url','STRING','text/html'];
assert.equal(paste('\\(x\\)','<p>\\(x\\)</p>',{types:browserTypes}).defaultPrevented,true);
assert.deepEqual(math(),[['math_inline','x']]);
assert.equal(paste('\\[x+y\\]','<p>\\[x+y\\]</p>',{types:browserTypes}).defaultPrevented,true);
assert.deepEqual(math(),[['math_display','x+y']]);
assert.equal(paste(table,'<table><tr><td>\\(x\\)</td></tr></table>',{types:browserTypes}).defaultPrevented,true);
assert.deepEqual(math(),[['math_inline','x']]);
for(const source of ['$n$','$1$',String.raw`\(n\)`,'$h(n)$']) {
 assert.equal(paste(source).defaultPrevented,true);assert.equal(math().length,1);
 assert.ok(!view.state.doc.textContent.includes('ZLSMATHPLACEHOLDER'));
 assert.ok(undo(view.state,view.dispatch.bind(view)));assert.equal(view.state.doc.textContent,'');
 assert.ok(redo(view.state,view.dispatch.bind(view)));assert.equal(math().length,1);
}
assert.equal(paste('$$1$$').defaultPrevented,true);assert.deepEqual(math(),[['math_display','1']]);
for (const text of ['normal text','\\(unclosed','`\\(code\\)`','`$n$`','```\n$n$\n```',String.raw`\$1`, '$5 and $10', '$ n $']) {
 assert.equal(paste(text,'<p>rich</p>',{types:browserTypes}).defaultPrevented,false);
 assert.equal(pasted,null);
}
assert.equal(paste('','<p>HTML only</p>',{types:['text/html']}).defaultPrevented,false);
code=true;assert.equal(paste('\\(x\\)').defaultPrevented,false);code=false;
assert.equal(paste('\\(x\\)','',{files:[{}]}).defaultPrevented,false);
assert.equal(paste('\\(x\\)','',{types:['zotero/annotation']}).defaultPrevented,false);
succeeds=false;assert.equal(paste('\\(x\\)').defaultPrevented,false);succeeds=true;
succeeds=false;assert.equal(paste('\\(x\\)','<p>rich</p>',{types:browserTypes}).defaultPrevented,false);succeeds=true;
// Failed or unsupported marker conversion must never change the real editor.
reset();
const original=view.state;
assert.equal(mathPasteTransaction(view,{insertMarkdown(){return true;}},'$n$'),null);
assert.equal(view.state,original);
const broken={insertMarkdown(markdown){this.view.dispatch(this.view.state.tr.insertText(markdown+markdown));return true;}};
assert.equal(mathPasteTransaction(view,broken,'$n$'),null);
assert.equal(view.state,original);
assert.equal(parser.view,view);
const initial=schema.nodes.doc.create(null,schema.nodes.paragraph.create(null,schema.text('before OLD after')));
view.state=EditorState.create({doc:initial,selection:TextSelection.create(initial,8,11),plugins:[history(),plugin]});
const replacement=mathPasteTransaction(view,parser,'$n$');assert.ok(replacement);
assert.equal(view.state.doc.textContent,'before OLD after','staging has no live side effects');
view.dispatch(replacement);assert.equal(view.state.doc.textContent,'before n after');
assert.ok(undo(view.state,view.dispatch.bind(view)));assert.ok(view.state.doc.eq(initial));
stop();assert.equal(paste('\\(x\\)').defaultPrevented,false);
win.close();
console.log('Math paste conversion and native-parser routing tests passed.');
