import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { normalizeMathPaste as normalize, installMathPaste } from './build/test-exports.mjs';
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
const view = {dom:el,editable:true,state:{
 selection:{$from:{parent:{type:{spec:{get code(){return code;}}}}}},
 plugins:[{getState:()=>({insertMarkdown(text){pasted=text;return succeeds;}})}],
 get tr(){return {setMeta(){return this;}};},
},dispatch(){}};
win._currentEditorInstance = {_editorCore:{view}};
const stop = installMathPaste(win);
function paste(text,html='',extra={}) {
 pasted=null;
 const e=new win.Event('paste',{bubbles:true,cancelable:true});
 Object.defineProperty(e,'clipboardData',{value:{files:[],types:['text/plain'],getData:type=>type==='text/plain'?text:type==='text/html'?html:'',...extra}});
 el.dispatchEvent(e);return e;
}
assert.equal(paste(table).defaultPrevented,true);assert.equal(pasted,normalize(table));
assert.equal(paste('normal text').defaultPrevented,false);
const browserTypes = ['text/plain','text/plain;charset=utf-8','UTF8_STRING','chromium/x-internal-source-rfh-token','TEXT','chromium/x-source-url','STRING','text/html'];
assert.equal(paste('\\(x\\)','<p>\\(x\\)</p>',{types:browserTypes}).defaultPrevented,true);
assert.equal(pasted,'$x$');
assert.equal(paste('\\[x+y\\]','<p>\\[x+y\\]</p>',{types:browserTypes}).defaultPrevented,true);
assert.equal(pasted,'\n\n$$\nx+y\n$$\n\n');
assert.equal(paste(table,'<table><tr><td>\\(x\\)</td></tr></table>',{types:browserTypes}).defaultPrevented,true);
assert.equal(pasted,normalize(table));
for (const text of ['normal text','\\(unclosed','`\\(code\\)`','$x$']) {
 assert.equal(paste(text,'<p>rich</p>',{types:browserTypes}).defaultPrevented,false);
 assert.equal(pasted,null);
}
assert.equal(paste('','<p>HTML only</p>',{types:['text/html']}).defaultPrevented,false);
code=true;assert.equal(paste('\\(x\\)').defaultPrevented,false);code=false;
assert.equal(paste('\\(x\\)','',{files:[{}]}).defaultPrevented,false);
assert.equal(paste('\\(x\\)','',{types:['zotero/annotation']}).defaultPrevented,false);
succeeds=false;assert.equal(paste('\\(x\\)').defaultPrevented,false);succeeds=true;
succeeds=false;assert.equal(paste('\\(x\\)','<p>rich</p>',{types:browserTypes}).defaultPrevented,false);succeeds=true;
stop();assert.equal(paste('\\(x\\)').defaultPrevented,false);
win.close();
console.log('Math paste conversion and native-parser routing tests passed.');
