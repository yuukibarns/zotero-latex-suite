import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { history, undo } from 'prosemirror-history';
import { EditorState, TextSelection } from 'prosemirror-state';
import katex from 'katex-zotero';
import * as ls from './build/test-exports.mjs';
import { mathView } from './test-editor.mjs';

const commands = ls.parseCommands(['\\alpha', '\\Alpha', '\\varalpha', '\\frac{#}{#}']);
// File settings retain a last good dictionary and expose invalid-file errors.
let fileText = '["\\\\alpha"]', stamp = 1;
const sandbox = { Zotero: {
 Prefs: { get:()=>JSON.stringify({loadCompletionFromFile:true,completionFileLocation:'/commands.json'}) },
 debug:()=>{}, File: {
  pathToFile:()=>({exists:()=>true,isDirectory:()=>false,leafName:'commands.json',path:'/commands.json',get lastModifiedTime(){return stamp;}}),
  getContentsAsync:async()=>fileText,
 },
} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('bootstrap.js','utf8')+'\nthis.checkFiles = refreshFileSources; this.getPayload = settingsJSON; this.getError = () => fileSources.get("completionCommands").error;', sandbox);
await sandbox.checkFiles();
assert.deepEqual(JSON.parse(sandbox.getPayload()).completionCommands,['\\alpha']);
fileText = '{broken'; stamp++;
await sandbox.checkFiles();
assert.ok(sandbox.getError());
assert.deepEqual(JSON.parse(sandbox.getPayload()).completionCommands,['\\alpha']);
fileText = '["\\\\beta"]'; stamp++;
await sandbox.checkFiles();
assert.equal(sandbox.getError(),null);
assert.deepEqual(JSON.parse(sandbox.getPayload()).completionCommands,['\\beta']);
assert.equal(ls.candidates(commands, 'alp')[0].replacement, '\\alpha');
assert.equal(ls.candidates(commands, 'Alp')[0].replacement, '\\Alpha');
assert.equal(ls.candidates(commands, 'aph')[0].replacement, '\\alpha');
assert.deepEqual(ls.candidates(commands, 'zzq'), []);
assert.deepEqual(ls.candidates(commands, ''), []);
assert.deepEqual(ls.candidates(ls.parseCommands(['\\axxxb','\\axb','\\ab']), 'ab').map(x=>x.replacement), ['\\ab','\\axb','\\axxxb']);
assert.throws(() => ls.parseCommands({}));
assert.throws(() => ls.parseCommands([{displayName:'x'}]));
assert.throws(() => ls.parseCommands(['a\nb']));
for (const source of ['alp', '\\alp', 'x+alp']) {
 const view = mathView(source), b = ls.PMBuffer.forMath(view, 'math_inline');
 const token = ls.tokenAt(b, 2);
 assert.equal(token.query, 'alp');
 ls.expandCompletion(b, token.from, token.to, ls.replacementOf('\\alpha'));
 assert.equal(view.state.doc.textContent, source.startsWith('x+') ? 'x+\\alpha' : '\\alpha');
}
assert.equal(ls.tokenAt(ls.PMBuffer.forMath(mathView('alpha', 2), 'math_inline'), 2), null);
assert.equal(ls.tokenAt(ls.PMBuffer.forMath(mathView('a'), 'math_inline'), 2), null);
assert.equal(ls.tokenAt({...ls.PMBuffer.forMath(mathView('alp'), 'math_inline'),inMath:false},2),null);
assert.equal(ls.tokenAt({...ls.PMBuffer.forMath(mathView('alp'), 'math_inline'),inMath:true,dollarMath:true},2),null);
assert.equal(ls.replacementOf('\\#').insert, '\\#');
assert.deepEqual(ls.replacementOf('\\frac{#}{#}').tabstops.map(x=>x.from), [6,8,9]);
assert.equal(ls.replacementOf('a\n~b', true).tabstops[0].from, 1);

// Real history plugin: completion forms one isolated event, including later typing.
const hist = mathView('');
hist.state = EditorState.create({doc:hist.state.doc, plugins:[history()]});
hist.dispatch(hist.state.tr.insertText('alp'));
ls.expandCompletion(ls.PMBuffer.forMath(hist,'math_inline'), 0,3,ls.replacementOf('\\alpha'));
hist.dispatch(hist.state.tr.insertText('+'));
assert.ok(undo(hist.state, hist.dispatch));
assert.equal(hist.state.doc.textContent,'\\alpha');
assert.ok(undo(hist.state, hist.dispatch));
assert.equal(hist.state.doc.textContent,'alp');

// Plain and nested completions preserve outer stops and remap them during edits.
for (const replacement of ['\\alpha', '\\frac{#}{#}']) {
 ls.clearTabstops();
 const view = mathView('');
 ls.expandSnippet(ls.PMBuffer.forMath(view,'math_inline'),0,0,{insert:'alp+z',tabstops:[{index:[0],from:0,to:3},{index:[1],from:4,to:5}]});
 view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,3)));
 ls.expandCompletion(ls.PMBuffer.forMath(view,'math_inline'),0,3,ls.replacementOf(replacement));
 if (replacement.includes('frac')) {
  view.dispatch(view.state.tr.insertText('x'));
  ls.setSelectionToNextTabstop(ls.PMBuffer.forMath(view,'math_inline'),false);
  view.dispatch(view.state.tr.insertText('y'));
  ls.setSelectionToNextTabstop(ls.PMBuffer.forMath(view,'math_inline'),false);
 }
 assert.ok(ls.setSelectionToNextTabstop(ls.PMBuffer.forMath(view,'math_inline'),false));
 assert.equal(view.state.doc.textBetween(view.state.selection.from,view.state.selection.to),'z');
}
ls.clearTabstops();

const fixtures = JSON.parse(fs.readFileSync('src/completion/fixtures.json','utf8'));
for (const c of ls.DEFAULT_COMMANDS) {
 assert.ok(fixtures[c.displayName]);
 assert.doesNotThrow(()=>katex.renderToString(fixtures[c.displayName],{throwOnError:true,displayMode:true,strict:'ignore',trust:false}), c.displayName);
}

// Exercise the actual built entrypoint with a DOM and real ProseMirror states.
const dom = new JSDOM('<html><head></head><body><math-inline class="math-node"><div contenteditable="true" tabindex="0"></div></math-inline></body></html>', {pretendToBeVisual:true});
const win = dom.window, doc = win.document, el = doc.querySelector('[contenteditable]');
const view = mathView('alp');
view.dom = el;
view.coordsAtPos = ()=>({left:20,right:20,top:20,bottom:40});
doc.querySelector('.math-node').pmViewDesc = {spec:{_innerView:view}};
win.__latexSuiteSettings = JSON.stringify({snippets:'export default []'});
new Function('window','navigator',fs.readFileSync('build/content-script.js','utf8'))(win, win.navigator);
el.focus();
const tick = ()=>new Promise(r=>win.requestAnimationFrame(()=>win.requestAnimationFrame(r)));
const input = async()=>{el.dispatchEvent(new win.Event('input',{bubbles:true})); await tick();};
const key = (name,extra={})=>{const e=new win.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...extra});el.dispatchEvent(e);return e;};
const popup = ()=>doc.getElementById('latex-suite-completion');
doc.dispatchEvent(new win.Event('selectionchange'));await tick();assert.equal(popup(),null);
win.dispatchEvent(new win.Event('resize'));await tick();assert.equal(popup(),null);
// ProseMirror can consume input and commit its state after the DOM event.
reset('al');
const consumeInput = e => e.stopPropagation();
el.addEventListener('input', consumeInput);
el.dispatchEvent(new win.InputEvent('input',{bubbles:true,inputType:'insertText',data:'p'}));
reset('alp');
await tick(); assert.ok(popup(), 'typing opens completion despite delayed editor state and consumed bubbling');
el.removeEventListener('input', consumeInput);
assert.equal(key('ArrowDown').defaultPrevented,true);
assert.equal(key('ArrowUp').defaultPrevented,true);
assert.equal(key('Enter').defaultPrevented,true);
assert.equal(view.state.doc.textContent,'\\alpha'); assert.equal(popup(),null);
function reset(s='alp') {view.dispatch(view.state.tr.insertText(s,0,view.state.doc.content.size));}
reset();await input();key('ArrowLeft');
doc.dispatchEvent(new win.Event('selectionchange'));await tick();assert.equal(popup(),null);
await input();assert.ok(popup());
view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,0)));
doc.dispatchEvent(new win.Event('selectionchange'));await tick();assert.equal(popup(),null);
view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,3)));
doc.dispatchEvent(new win.Event('selectionchange'));await tick();assert.equal(popup(),null);
el.dispatchEvent(new win.InputEvent('input',{bubbles:true,inputType:'historyUndo'}));await tick();assert.equal(popup(),null);
reset('aph');await input();key('Enter');assert.equal(view.state.doc.textContent,'\\alpha');
reset();await input();key('Escape');await tick();assert.equal(popup(),null);
doc.dispatchEvent(new win.Event('selectionchange'));await tick();assert.equal(popup(),null);
reset('alph');await input();assert.ok(popup());key('Tab');assert.equal(popup(),null);
reset();await input();assert.equal(key('Enter',{shiftKey:true}).defaultPrevented,false);assert.equal(popup(),null);
reset();await input();el.dispatchEvent(new win.CompositionEvent('compositionstart',{bubbles:true}));assert.equal(popup(),null);
key('Enter',{isComposing:true});assert.equal(view.state.doc.textContent,'alp');
el.dispatchEvent(new win.CompositionEvent('compositionend',{bubbles:true}));await tick();assert.ok(popup());
reset('beta');key('Enter');assert.equal(view.state.doc.textContent,'beta'); // stale popup cannot insert
reset();await input();
const other = mathView('alp'); other.dom=el; other.coordsAtPos=view.coordsAtPos;
doc.querySelector('.math-node').pmViewDesc.spec._innerView=other;
key('Enter');assert.equal(other.state.doc.textContent,'alp');
doc.querySelector('.math-node').pmViewDesc.spec._innerView=view;
reset();await input();el.blur();await tick();assert.equal(popup(),null);
el.focus();await input();
win.__latexSuiteReload(JSON.stringify({snippetsEnabled:false}));await input();assert.ok(popup());
key('Escape');
win.__latexSuiteReload(JSON.stringify({completionEnabled:false}));await input();assert.equal(popup(),null);
win.__latexSuiteReload(JSON.stringify({snippets:'export default [{trigger:"alp",replacement:"CUSTOM",options:"mA"}]'}));
reset('al');await input();key('p');assert.equal(view.state.doc.textContent,'CUSTOM');assert.equal(popup(),null);
doc.dispatchEvent(new win.Event('selectionchange'));await tick();assert.equal(popup(),null);
win.__latexSuiteUninstall();await tick();assert.equal(popup(),null);
assert.equal(doc.querySelector('style'),null);
win.close();
console.log(`Completion checks passed (${ls.DEFAULT_COMMANDS.length} KaTeX-compatible dictionary entries).`);
