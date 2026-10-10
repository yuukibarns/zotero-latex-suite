import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import katex from "katex-zotero";
import { EditorState, TextSelection } from "prosemirror-state";
import { Schema } from "prosemirror-model";
import { sourceGlyphs } from "./build/katex-source-map.mjs";
import { createMathSourceMap, mathCaretAt, installMathCaret } from "./build/test-exports.mjs";

const dom = new JSDOM('<math-inline class="math-node"><span class="math-render"></span></math-inline>', {
	pretendToBeVisual: true,
});
const win = dom.window,
	doc = win.document,
	node = doc.querySelector(".math-node"),
	render = doc.querySelector(".math-render");
const getMap = createMathSourceMap();
function mapped(source, options = {}) {
	render.innerHTML = katex.renderToString(source, options);
	const html = render.querySelector(".katex-html"),
		map = getMap(html, source, options);
	assert.ok(map, `native/map signature agrees: ${source.slice(0, 80)}`);
	assert.deepEqual(map, sourceGlyphs(source, options));
	for (const g of map) if (g.from !== null) assert.ok(g.from >= 0 && g.to >= g.from && g.to <= source.length);
	return map;
}
for (const displayMode of [false, true])
	for (const source of [
		"a+b+c",
		"12345+x",
		String.raw`\sin x+s`,
		String.raw`\alpha+α`,
		String.raw`\frac{a}{b}+\sum_{i=1}^n x_i`,
		String.raw`\sqrt{x}+\sqrt[3]{y}`,
		String.raw`\left(\frac{x}{y}\middle|z\right)`,
		String.raw`\mathbb{E}_{x\sim p_t}[D_{\text{KL}}]`,
		String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`,
		String.raw`\begin{aligned}x&=a\\y&=b\end{aligned}`,
		String.raw`\hat{x}+\vec{y}+\overline{ab}`,
		String.raw`\text{hello world}+\operatorname{foo}(x)`,
		String.raw`\neq+\iff+\notin`,
		String.raw`\def\f#1{#1!}\f{a}`,
		"x+".repeat(1100) + "y",
	])
		mapped(source, { displayMode });
assert.deepEqual(
	mapped("12345+x").find(g => g.text === "3"),
	{ text: "3", from: 2, to: 3 },
);
assert.deepEqual(
	mapped(String.raw`\sin x+s`)
		.filter(g => g.text === "s")
		.map(g => [g.from, g.to]),
	[
		[0, 4],
		[7, 8],
	],
);
assert.deepEqual(
	mapped(String.raw`\alpha+α`)
		.filter(g => g.text === "α")
		.map(g => [g.from, g.to]),
	[
		[0, 6],
		[7, 8],
	],
);
assert.deepEqual(
	mapped(String.raw`\text{ab}`).map(g => [g.from, g.to]),
	[
		[6, 7],
		[7, 8],
	],
);
for (const [source, expected] of [
	[String.raw`\frac{a}{b}`, ["b", "a"]],
	[String.raw`x_i^t`, ["x", "i", "t"]],
	[String.raw`\left(x\middle|y\right)`, ["(", "x", "|", "y", ")"]],
	[String.raw`\begin{matrix}a&b\\c&d\end{matrix}`, ["a", "c", "b", "d"]],
	[String.raw`\mathbb{E}_{x\sim p_t}`, ["E", "x", "\\sim", "p", "t"]],
	[String.raw`\def\f#1{#1!}\f{a}`, ["a", "\\f{a}"]],
	[String.raw`\text{ab--cd}`, ["a", "b", "--", "c", "d"]],
])
	assert.deepEqual(
		mapped(source).map(g => (g.from === null ? null : source.slice(g.from, g.to))),
		expected,
		source,
	);
const macros = { "\\foo": "\\alpha" };
assert.deepEqual(mapped(String.raw`\foo+x`, { macros })[0], { text: "α", from: 0, to: 4 });
assert.deepEqual(macros, { "\\foo": "\\alpha" }, "mapping does not mutate shared macros");
mapped("x");
const html = render.querySelector(".katex-html");
html.textContent = "different";
assert.equal(getMap(html, "x", {}), null, "mismatched native renderer falls back");
assert.equal(getMap(html, "\\invalidcommand", {}), null, "parse errors fall back");
// The same native root can be mutated by another plugin: always revalidate it.
html.textContent = "x";
assert.ok(getMap(html, "x", {}));
assert.equal(getMap(html, "y", {}), null, "same root with a different source is not a cache hit");

// The open hook must finish placement synchronously and preserve native return,
// modifiers, drag behavior, teardown, and later hooks installed by other plugins.
mapped("a+b+c");
const target = render.querySelector(".katex-html .mathnormal");
Object.defineProperty(win, "performance", { value: undefined, configurable: true });
win.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 10, top: 0, bottom: 20, width: 10, height: 20 });
win.Element.prototype.getBoundingClientRect = () => ({ left: 0, right: 10, top: 0, bottom: 20, width: 10, height: 20 });
const nativeHTML = render.querySelector(".katex-html"),
	shape = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
nativeHTML.append(shape);
const nativeMap = getMap(nativeHTML, "a+b+c", {});
assert.equal(
	mathCaretAt(nativeHTML, nativeMap, shape, 8, 10),
	1,
	"transparent radical box does not block its argument",
);
assert.equal(mathCaretAt(nativeHTML, nativeMap, shape, 18, 10), null, "radical stroke does not guess a nearby glyph");
shape.remove();
win.requestAnimationFrame = () => {
	throw Error("Caret placement must not schedule frames");
};
const schema = new Schema({ nodes: { doc: { content: "text*" }, text: {} } });
const math = { _node: { textContent: "a+b+c" }, _katexOptions: {}, _mathRenderElt: render, _innerView: null };
node.pmViewDesc = { spec: math };
const nativeOpen = function () {
	const state = EditorState.create({ schema, doc: schema.node("doc", null, schema.text("a+b+c")) });
	this._innerView = {
		state: state.apply(state.tr.setSelection(TextSelection.create(state.doc, 5))),
		dispatch(tr) {
			this.state = this.state.apply(tr);
		},
		focus() {},
	};
	return 17;
};
math.openEditor = nativeOpen;
const stop = installMathCaret(win);
function down(options = {}) {
	math._innerView = null;
	const e = new win.MouseEvent("mousedown", {
		bubbles: true,
		cancelable: true,
		detail: 1,
		clientX: 8,
		clientY: 10,
		...options,
	});
	target.dispatchEvent(e);
	assert.equal(e.defaultPrevented, false);
}
for (const options of [
	{ button: 2 },
	{ ctrlKey: true },
	{ shiftKey: true },
	{ altKey: true },
	{ metaKey: true },
	{ detail: 2 },
]) {
	down(options);
	assert.equal(math.openEditor, nativeOpen);
}
down();
assert.notEqual(math.openEditor, nativeOpen);
assert.equal(math.openEditor(), 17);
assert.equal(math._innerView.state.selection.head, 1, "target caret before openEditor returns");
assert.equal(math.openEditor, nativeOpen);
assert.equal(doc.querySelectorAll(".math-node").length, 1, "no probe DOM");
down();
doc.body.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true, button: 0, clientX: 8, clientY: 10 }));
assert.notEqual(
	math.openEditor,
	nativeOpen,
	"stationary release retargeted to an ancestor must retain the opening hook",
);
assert.equal(math.openEditor(), 17);
assert.equal(
	math._innerView.state.selection.head,
	1,
	"retargeted release still places caret when native opens this node",
);
for (const options of [{ clientX: 14 }, { shiftKey: true }, { button: 2 }]) {
	down();
	doc.body.dispatchEvent(
		new win.MouseEvent("mouseup", { bubbles: true, button: 0, clientX: 8, clientY: 10, ...options }),
	);
	assert.equal(math.openEditor, nativeOpen, "movement/modifier/wrong-button releases still cancel");
}
for (const [reason, cancel] of [
	["blur", () => win.dispatchEvent(new win.Event("blur"))],
	["keydown", () => doc.dispatchEvent(new win.KeyboardEvent("keydown", { bubbles: true, key: "x" }))],
	[
		"drag-threshold",
		() => doc.dispatchEvent(new win.MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 20 })),
	],
]) {
	down();
	cancel();
	assert.equal(math.openEditor, nativeOpen);
	assert.ok(
		win.__latexSuiteMathCaretDiagnostic.events.some(e => e.stage === "cancel" && e.reason === reason),
		"record why mapping was abandoned",
	);
}
delete math.openEditor;
Object.setPrototypeOf(math, { openEditor: nativeOpen });
down();
win.dispatchEvent(new win.Event("blur"));
assert.equal(Object.hasOwn(math, "openEditor"), false);
down();
const other = () => 23;
math.openEditor = other;
win.dispatchEvent(new win.Event("blur"));
assert.equal(math.openEditor, other);
const openingError = new Error("native failed");
math.openEditor = function () {
	throw openingError;
};
const throws = math.openEditor;
down();
assert.throws(
	() => math.openEditor(),
	e => e === openingError,
);
assert.equal(math.openEditor, throws, "restore even when native opening throws");
assert.ok(win.__latexSuiteMathCaretDiagnostic.events.some(e => e.stage === "native-open-error"));
math.openEditor = function () {
	nativeOpen.call(this);
	this._innerView.editable = false;
};
const readonly = math.openEditor;
down();
math.openEditor();
assert.equal(math._innerView.state.selection.head, 5, "read-only view untouched");
assert.equal(math.openEditor, readonly);
math.openEditor = function () {
	nativeOpen.call(this);
	const v = this._innerView;
	v.state = v.state.apply(v.state.tr.insertText("new", 0, 5));
};
down();
math.openEditor();
assert.equal(math._innerView.state.selection.head, 3, "changed source cancels stale mapping");
math.openEditor = nativeOpen;
down();
stop();
stop();
assert.equal(math.openEditor, nativeOpen);
down();
assert.equal(math.openEditor, nativeOpen);
assert.equal(win.__latexSuiteMathCaretDiagnostic, undefined);
console.log(
	"Source-map caret: numbers, commands, repeated symbols, scripts, matrices, macros, long equations, synchronous opening and cleanup passed.",
);
