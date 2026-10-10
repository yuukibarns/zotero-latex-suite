import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import {
	mathSelectionRegions,
	createMathSelection,
	createMathDragSelection,
	createMathSiblingDrag,
	installMathMouseSelection,
	normalizeMathClickTimeout,
} from "./build/test-exports.mjs";
{
	const source = String.raw`z+\frac{a}{b}+\frac{c+d}{e}+w`;
	const start = source.indexOf("\\frac"),
		end = source.indexOf("+\\frac", start + 1);
	const extend = createMathSiblingDrag(source, { from: start, to: end });
	const secondEnd = source.lastIndexOf("+w");
	assert.deepEqual(
		extend(source.indexOf("c+d") + 1),
		{ anchor: start, head: secondEnd },
		"drag includes complete sibling fraction, not parent",
	);
	assert.deepEqual(extend(start + 2), { anchor: start, head: end }, "return to seed shrinks back");
	assert.deepEqual(extend(0), { anchor: end, head: 0 }, "reverse drag keeps original far edge");
	const nested = String.raw`\frac{(a)+(b)+(c)}{d}`;
	const a = nested.indexOf("(a)"),
		b = nested.indexOf("(b)");
	const inside = createMathSiblingDrag(nested, { from: a, to: a + 3 });
	assert.deepEqual(inside(b + 2), { anchor: a, head: b + 3 }, "same-level bracket groups");
	assert.equal(inside(nested.length).head, nested.indexOf("}{"), "drag stays in starting parent");
}
const dragBounds = createMathDragSelection();
for (const [source, from, to, expectedFrom, expectedTo] of [
	[String.raw`p_{t} = \alpha_{t} p_{0} + (1 - \alpha_{t}) \pi_{t}`, 6, 50, 6, 51],
	["x_{t}", 0, 4, 0, 5],
	["x_{t}", 3, 4, 3, 4],
	["x_{t}", 4, 4, 4, 4],
	["x_{{t}}", 0, 5, 0, 7],
	["x_{{t}}", 4, 5, 4, 5],
	["{a}+b", 1, 5, 0, 5],
	["{a}+b", 1, 2, 1, 2],
	["x_{t }  +y", 0, 4, 0, 6],
	["x_{t}y", 0, 4, 0, 5],
	[String.raw`x\{t\}`, 0, 4, 0, 4],
	["x_{t", 0, 4, 0, 4],
	["x_{t% }\n}", 0, 4, 0, 4],
	["x_{t}}", 0, 4, 0, 5],
	[String.raw`\text{abc}`, 0, 9, 0, 10],
]) {
	assert.deepEqual(dragBounds(source, from, to), { anchor: expectedFrom, head: expectedTo }, source);
	assert.deepEqual(dragBounds(source, to, from), { anchor: expectedTo, head: expectedFrom }, "reverse " + source);
}
assert.equal(normalizeMathClickTimeout(undefined), 1000);
for (const invalid of [null, NaN, Infinity, "", false, "oops"]) assert.equal(normalizeMathClickTimeout(invalid), 1000);
assert.equal(normalizeMathClickTimeout(1), 200);
assert.equal(normalizeMathClickTimeout(9999), 5000);
assert.equal(normalizeMathClickTimeout("1800"), 1800);
assert.equal(normalizeMathClickTimeout(1234.9), 1234);
function sequence(text, at, includeOutside = false) {
	const buffer = {
		owner: {},
		kind: "math_inline",
		text,
		from: at,
		to: at,
		setSelection(from, to) {
			this.from = from;
			this.to = to;
		},
	};
	const select = createMathSelection(),
		output = [];
	for (let n = 0; n < 20 && select(buffer, false, true, includeOutside); n++)
		output.push(text.slice(buffer.from, buffer.to));
	return { buffer, select, output };
}
assert.deepEqual(sequence("z+\\frac{a+b}{c}", 9).output, ["a", "a+b", "\\frac{a+b}{c}", "z+\\frac{a+b}{c}"]);
for (const name of ["aligned", "matrix", "pmatrix", "align*", "custom_env-2"]) {
	const block = `\\begin{${name}}a+b\\end{${name}}`;
	const text = "z+" + block + "+w";
	assert.deepEqual(
		sequence(text, text.indexOf("a+b"), true).output,
		["a", "a+b", block, text],
		"environment inside/outside selection: " + name,
	);
}
const innerEnv = String.raw`\begin{matrix}a&b\\c&d\end{matrix}`;
const outerBody = "\n" + innerEnv + "+x\n";
const outerEnv = String.raw`\begin{aligned}` + outerBody + String.raw`\end{aligned}`;
const envSource = "z+" + outerEnv + "+w";
assert.deepEqual(
	sequence(envSource, envSource.indexOf("a&b"), true).output,
	["a", String.raw`a&b\\c&d`, innerEnv, outerBody, outerEnv, envSource],
	"nested environments expand from inner to outer",
);
const sameName = String.raw`z+\begin{matrix}\begin{matrix}a+b\end{matrix}+c\end{matrix}+w`;
assert.equal(sequence(sameName, sameName.indexOf("a+b"), true).output.length, 6, "same-name nesting is stack based");
const spaced = String.raw`z+\begin {aligned*}` + "\na+b\n" + String.raw`\end {aligned*}+w`;
assert.deepEqual(
	sequence(spaced, spaced.indexOf("a+b"), true).output,
	["a", "\na+b\n", spaced.slice(2, -2), spaced],
	"whitespace around environment headers",
);
for (const block of [
	String.raw`\begin{matrix}a+b`,
	String.raw`\begin{matrix}a+b\end{aligned}`,
	String.raw`\begin{matrix}\begin{aligned}a+b\end{matrix}\end{aligned}`,
]) {
	const text = "z+" + block + "+w";
	assert.deepEqual(
		sequence(text, text.indexOf("a+b"), true).output,
		["a", text],
		"incomplete/mismatched environments do not create regions",
	);
}
for (const block of [
	String.raw`\text{literal \begin{matrix}a+b\end{matrix}}`,
	String.raw`\verb|\begin{matrix}a+b\end{matrix}|`,
	"% \\begin{matrix}\na+b\n% \\end{matrix}",
]) {
	const text = "z+" + block + "+w";
	assert.ok(
		!mathSelectionRegions(text, true).some(r => text.slice(r.from, r.to).startsWith("\\begin")),
		"literal/comment environment commands ignored",
	);
}
const envRun = sequence("z+" + outerEnv + "+w", ("z+" + outerEnv).indexOf("a&b"), true);
assert.ok(envRun.select(envRun.buffer, true));
assert.equal(
	envRun.buffer.text.slice(envRun.buffer.from, envRun.buffer.to),
	outerEnv,
	"environment selection can shrink",
);
for (const [left, right] of [
	["(", ")"],
	["[", "]"],
	["\\langle", "\\rangle"],
	["\\{", "\\}"],
	["\\lvert", "\\rvert"],
	["\\lVert", "\\rVert"],
	["\\lfloor", "\\rfloor"],
	["\\lceil", "\\rceil"],
]) {
	const gap = /[a-zA-Z]$/.test(left) ? " " : "";
	const text = `z+${left}${gap}a+b${right}`;
	assert.deepEqual(
		sequence(text, 2 + left.length + gap.length).output,
		["a", gap + "a+b", text],
		`${left}: no delimiter-only step`,
	);
}
const scalable = "z+\\left\\langle a+b \\middle| c \\right\\rangle";
for (const bar of ["|", "||", "\\|"]) {
	const text = `z+${bar}a+b${bar}`;
	assert.deepEqual(
		sequence(text, text.indexOf("a+b"), true).output,
		["a", text],
		"bare bars create no selection levels",
	);
}
for (const bar of ["|", "\\|"]) {
	const text = `z+\\left${bar} a+b \\right${bar}`;
	assert.deepEqual(
		sequence(text, text.indexOf("a+b"), true).output,
		["a", " a+b ", text.slice(2), text],
		"explicit scalable bars retain inside/outside levels",
	);
}
assert.deepEqual(sequence(scalable, scalable.indexOf("a+b")).output, ["a", " a+b \\middle| c ", scalable]);
const nested = "z+(a+[b+c])";
for (const body of [
	"x | y",
	"x |\n y",
	String.raw`x_{t}^{i} | x_{t - \Delta t}^{i}`,
	"x + |y|",
	"x || y",
	String.raw`x \| y`,
]) {
	const text = `z+(${body})`;
	const output = sequence(text, text.indexOf("x"), true).output;
	assert.ok(output.includes(body), "conditional/absolute bars retain inside level: " + body);
	assert.ok(output.includes(`(${body})`), "conditional/absolute bars retain outside level: " + body);
}
const conditional = String.raw`p_{t - \Delta t | t}^{\text{tweedie}, i} (x_{t - \Delta t}^{i} | \mathbf{x}_{t}) = \exp(\sigma_{t - \Delta t}^{t} Q) (x_{t}^{i} | x_{t - \Delta t}^{i}) \left( \exp(-\sigma_{t - \Delta t}^{t} Q) s_{t}^{\theta}(\mathbf{x}_{t})_{i}\right)_{x_{t - \Delta t}^{i}}`;
const conditionalBody = String.raw`x_{t}^{i} | x_{t - \Delta t}^{i}`;
assert.ok(
	sequence(conditional, conditional.indexOf(conditionalBody), true).output.includes(`(${conditionalBody})`),
	"reported equation retains conditional parentheses",
);
assert.deepEqual(sequence(nested, nested.indexOf("b")).output, ["b", "b+c", "a+[b+c]", nested]);
assert.ok(!mathSelectionRegions("z+(a+b]").some(r => r.from === 3), "mismatched delimiters skipped");
assert.ok(!mathSelectionRegions("z+{a|b}").some(r => r.from === 5), "unmatched bar skipped");
assert.ok(!mathSelectionRegions("z+\\verb|(a+b)|").some(r => r.from === 9), "verbatim body skipped");
assert.ok(!mathSelectionRegions("z+% (a+b)\nx").some(r => r.from === 5), "comment delimiters skipped");
assert.ok(!mathSelectionRegions("z+\\text{(a+b)}").some(r => r.from === 9), "literal text delimiters skipped");
const run = sequence("z+(abc)", 4);
assert.equal(run.select(run.buffer, true), true);
assert.equal(run.buffer.text.slice(run.buffer.from, run.buffer.to), "abc");
assert.equal(run.select(run.buffer, true), true);
assert.deepEqual([run.buffer.from, run.buffer.to], [4, 4]);
run.buffer.from = 0;
run.buffer.to = 0;
assert.equal(run.select(run.buffer, true), false, "manual selection invalidates shrink history");
run.buffer.kind = "text";
assert.equal(run.select(run.buffer, false), false, "ordinary text untouched");
console.log("Math selection: words, groups, named/scalable delimiters, fractions, shrink and invalidation passed.");
const reported = String.raw`\mathcal{L}_{\text{SE}} := \mathbb{E}_{x \sim p_{t}} \left[ \sum_{y \neq x} w_{x y} \left( s^{\theta}(x)_{y} - \frac{p(y)}{p(x)} \log s^{\theta}(x)_{y} + K \left( \frac{p(y)}{p(x)} \right)  \right)   \right]`;
const firstFraction = reported.indexOf("\\frac");
const expanded = sequence(reported, firstFraction + 2).output;
assert.equal(expanded[0], "\\frac");
assert.equal(expanded[1], "\\frac{p(y)}{p(x)}");
assert.ok(expanded[2].startsWith(" s^{\\theta}(x)_{y} - \\frac"), "first enclosing scalable parentheses");
assert.ok(expanded[3].startsWith(" \\sum_"), "outer scalable brackets");
assert.equal(expanded[4], reported);
assert.equal(expanded.length, 5, "reported equation must not skip scalable regions");
const scripted = String.raw`\nabla_{s^{\theta}(x)_{y}} \mathcal{L}_{\text{SE}} = \frac{1}{s^{\theta}(x)_{y}} \mathcal{L}_{\text{CSM}}`;
assert.deepEqual(sequence(scripted, scripted.indexOf("{L}") + 1).output, [
	"L",
	"\\mathcal{L}",
	"\\mathcal{L}_{\\text{SE}}",
	scripted,
]);
assert.deepEqual(sequence(scripted, scripted.indexOf("SE") + 1).output, [
	"SE",
	"\\text{SE}",
	"\\mathcal{L}_{\\text{SE}}",
	scripted,
]);
for (const suffix of ["_{i}^{2}", "^2_i", "_\\alpha^😀", " ^{k} _{j}"]) {
	const text = "x+\\mathbb{E}" + suffix + "+y";
	const output = sequence(text, text.indexOf("{E}") + 1).output;
	assert.deepEqual(output, ["E", "\\mathbb{E}", "\\mathbb{E}" + suffix, text]);
}
assert.deepEqual(
	sequence("x+\\mathcal{L}_{unfinished", 12).output,
	["L", "\\mathcal{L}", "x+\\mathcal{L}_{unfinished"],
	"incomplete script does not create a false term region",
);
for (const term of [
	"x_{i}",
	"x_{i}^{t}",
	"x^t_i",
	"x_i^2",
	"x_1^2",
	"😀_{i}",
	String.raw`\alpha_i`,
	String.raw`\sum_{i=1}^{n}`,
	String.raw`\prod\limits_{i=1}^{n}`,
	String.raw`\int\nolimits_0^1`,
	String.raw`x_\alpha^2`,
	String.raw`x^{y_j}_{i}`,
]) {
	const text = "z+" + term + "+w";
	assert.ok(sequence(text, 2, true).output.includes(term), "base atom plus scripts: " + term);
	assert.ok(
		mathSelectionRegions(text, true).some(r => r.from === 2 && r.to === 2 + term.length),
		"exact scripted atom boundary",
	);
}
assert.deepEqual(
	sequence("z+x_{i}^{t}+w", 2, true).output,
	["x", "x_{i}^{t}", "z+x_{i}^{t}+w"],
	"one complete scripted level, not partial scripts",
);
assert.deepEqual(
	sequence("z+x_{i}^{t}+w", 5, true).output,
	["i", "{i}", "x_{i}^{t}", "z+x_{i}^{t}+w"],
	"selecting inside a script reaches its base atom",
);
for (const source of ["z+x_i^2+w", String.raw`z+x_\alpha^2+w`]) {
	const argument = source.indexOf("_") + 1;
	assert.ok(
		!mathSelectionRegions(source, true).some(r => r.from === argument && source.slice(r.from, r.to).includes("^")),
		"unbraced script arguments cannot steal the following superscript",
	);
}
assert.ok(
	mathSelectionRegions("z+xy_i+w").some(r => r.from === 3 && r.to === 6),
	"only y, not xy, is the scripted base",
);
const commented = "z+x % base\n _{i} % script\n ^{t}+w";
assert.ok(
	mathSelectionRegions(commented).some(
		r => r.from === 2 && commented.slice(r.from, r.to) === "x % base\n _{i} % script\n ^{t}",
	),
	"comments are whitespace between script parts",
);
for (const term of ["x_{unfinished", "x_", "x^", String.raw`\sum\limits_{unfinished`, String.raw`\frac{a}_{i}`]) {
	const text = "z+" + term;
	assert.ok(
		!mathSelectionRegions(text).some(r => r.from === 2 && r.to > 2),
		"incomplete bases/scripts do not create guessed terms: " + term,
	);
}
const expectation = String.raw`z+\mathbb{E}_{x \sim p_t}[D_{\text{KL}}(a || b)]+w`;
const expectedAtom = String.raw`\mathbb{E}_{x \sim p_t}`;
assert.deepEqual(
	sequence(expectation, expectation.indexOf("{E}") + 1, true).output,
	["E", "{E}", "\\mathbb{E}", expectedAtom, expectation],
	"expectation is not joined to adjacent brackets",
);
for (const text of [String.raw`z+\text{literal x_i}+w`, String.raw`z+\verb|x_i|+w`, "z+% x_i\nw"]) {
	assert.ok(
		!mathSelectionRegions(text).some(r => text.slice(r.from, r.to) === "x_i"),
		"literal/comment atoms excluded",
	);
}
for (const name of [
	"dot",
	"ddot",
	"dddot",
	"ddddot",
	"vec",
	"hat",
	"widehat",
	"tilde",
	"widetilde",
	"bar",
	"overline",
	"underline",
	"acute",
	"grave",
	"breve",
	"check",
	"widecheck",
	"mathring",
	"overrightarrow",
	"overleftarrow",
	"overleftrightarrow",
	"underrightarrow",
	"underleftarrow",
	"underleftrightarrow",
	"overbrace",
	"underbrace",
]) {
	const text = `z+\\${name}{x+y}_{i}^{2}`;
	assert.deepEqual(
		sequence(text, text.indexOf("x+y")).output,
		["x", "x+y", `\\${name}{x+y}`, `\\${name}{x+y}_{i}^{2}`, text],
		`${name}: accent and scripted term levels`,
	);
}
const accents = String.raw`z+\hat{\vec{x}}_{i}`;
assert.deepEqual(
	sequence(accents, accents.indexOf("{x}") + 1).output,
	["x", "\\vec{x}", "\\hat{\\vec{x}}", "\\hat{\\vec{x}}_{i}", accents],
	"nested accents expand outward",
);
for (const name of ["mycommand", "customMacro", "userAccent", "custom_macro:nn"]) {
	const text = `z+\\${name}{a+b}{c}_{i}`;
	assert.deepEqual(
		sequence(text, text.indexOf("a+b")).output,
		["a", "a+b", `\\${name}{a+b}{c}`, `\\${name}{a+b}{c}_{i}`, text],
		"custom macros need no whitelist",
	);
}
assert.deepEqual(sequence("z+\\custom*{a+b}", 11).output, ["a", "a+b", "\\custom*{a+b}", "z+\\custom*{a+b}"]);
for (const text of ["\\begin{aligned}", "\\end{aligned}", "\\left{", "\\right}", "\\custom[opt]{a}", "\\frac{a}"]) {
	assert.ok(
		!mathSelectionRegions("z+" + text).some(r => r.from === 2 && r.to === text.length + 2),
		"structural/optional/incomplete signatures are not guessed",
	);
}
for (const [open, close] of [
	["(", ")"],
	["[", "]"],
	["{", "}"],
	["\\langle ", "\\rangle"],
	["\\left( ", " \\right)"],
]) {
	const text = `z+${open}a+b${close}`;
	const contents = (open.endsWith(" ") ? " " : "") + "a+b" + (close.startsWith(" ") ? " " : "");
	assert.deepEqual(
		sequence(text, text.indexOf("a+b"), true).output,
		["a", contents, open + "a+b" + close, text],
		"inside then outside levels",
	);
}
const win = new JSDOM('<body><math-inline class="math-node"><div></div></math-inline><p>ordinary</p></body>').window;
const node = win.document.querySelector("math-inline"),
	dom = node.firstChild;
const schema = new Schema({ nodes: { doc: { content: "text*" }, text: {} } });
const view = {
	dom,
	editable: true,
	state: EditorState.create({ schema, doc: schema.node("doc", null, schema.text("z+(abc)")) }),
	posAtCoords: ({ left }) => ({ pos: left }),
	focus() {},
	dispatch(tr) {
		this.state = this.state.apply(tr);
	},
};
node.pmViewDesc = { spec: { _innerView: view } };
const stopMouse = installMathMouseSelection(win);
let mouseTime = 0;
function mouse(type, detail, pos = 4, target = dom) {
	const e = new win.MouseEvent(type, {
		detail,
		clientX: pos,
		bubbles: true,
		cancelable: true,
		button: 0,
		buttons: ["mousedown", "mousemove"].includes(type) ? 1 : 0,
	});
	Object.defineProperty(e, "timeStamp", { value: mouseTime });
	target.dispatchEvent(e);
	return e;
}
assert.ok(mouse("mousedown", 1).defaultPrevented);
const nativeStart = new win.Event("selectstart", { bubbles: true, cancelable: true });
dom.dispatchEvent(nativeStart);
assert.ok(nativeStart.defaultPrevented, "native selection initiation suppressed");
assert.equal(view.state.selection.from, 4);
assert.equal(view.state.selection.to, 4);
assert.ok(mouse("mouseup", 1).defaultPrevented);
assert.ok(mouse("mousedown", 2).defaultPrevented);
assert.deepEqual([view.state.selection.from, view.state.selection.to], [3, 6], "custom double click selects word");
mouse("mouseup", 2);
mouse("mousedown", 3);
assert.deepEqual(
	[view.state.selection.from, view.state.selection.to],
	[2, 7],
	"third click includes enclosing parens when contents equal word",
);
mouse("mouseup", 3);
mouse("click", 3);
mouse("dblclick", 3);
mouse("mousedown", 1);
assert.deepEqual(
	[view.state.selection.from, view.state.selection.to],
	[0, 7],
	"native count restart still expands outward",
);
mouse("mouseup", 1);
win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
mouse("mousedown", 1, 0);
mouse("mousemove", 1, 6);
mouse("mouseup", 1, 6);
assert.deepEqual([view.state.selection.from, view.state.selection.to], [0, 6], "custom drag selection");
mouse("mousedown", 1, 6);
mouse("mousemove", 1, 0);
mouse("mouseup", 1, 0);
assert.deepEqual([view.state.selection.anchor, view.state.selection.head], [6, 0], "backward drag direction preserved");
assert.equal(
	mouse("mousedown", 3, 0, win.document.querySelector("p")).defaultPrevented,
	false,
	"ordinary notes untouched",
);
stopMouse();
assert.equal(mouse("mousedown", 1).defaultPrevented, false, "cleanup removes custom handlers");
{
	const before = view.state;
	view.state = EditorState.create({ schema, doc: schema.node("doc", null, schema.text("(abc)+(def)+(ghi)")) });
	const stop = installMathMouseSelection(win);
	mouseTime += 2000;
	mouse("mousedown", 1, 2);
	mouse("mouseup", 1, 2);
	mouse("mousedown", 2, 2);
	mouse("mousemove", 2, 8);
	mouse("mouseup", 2, 8);
	mouse("click", 2, 8);
	assert.deepEqual(
		[view.state.selection.from, view.state.selection.to],
		[1, 10],
		"double-click drag extends by words and survives release",
	);
	win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
	mouseTime += 2000;
	mouse("mousedown", 1, 2);
	mouse("mouseup", 1, 2);
	mouse("mousedown", 2, 2);
	mouse("mouseup", 2, 2);
	mouse("mousedown", 3, 2);
	mouse("mousemove", 3, 8);
	assert.deepEqual(
		[view.state.selection.from, view.state.selection.to],
		[0, 11],
		"structural drag extends across sibling groups",
	);
	const selectedState = view.state;
	assert.ok(mouse("mousemove", 3, 9).defaultPrevented, "unchanged sibling selection still owns native drag");
	assert.equal(view.state, selectedState, "movement within selected sibling does not dispatch");
	mouse("mousemove", 3, 2);
	mouse("mouseup", 3, 2);
	assert.deepEqual([view.state.selection.from, view.state.selection.to], [0, 5], "structural drag can shrink to seed");
	stop();
	view.state = before;
}
{
	const stop = installMathMouseSelection(win);
	for (const inactive of ["readonly", "disconnected", "destroyed"]) {
		mouseTime += 2000;
		mouse("mousedown", 1, 0);
		const before = view.state;
		if (inactive === "readonly") view.editable = false;
		if (inactive === "disconnected") node.remove();
		if (inactive === "destroyed") view.isDestroyed = true;
		assert.equal(mouse("mousemove", 1, 6, win.document).defaultPrevented, false, "inactive drag yields: " + inactive);
		assert.equal(view.state, before, "inactive drag does not dispatch: " + inactive);
		view.editable = true;
		view.isDestroyed = false;
		if (!node.isConnected) win.document.body.prepend(node);
		mouse("mousemove", 1, 6);
		assert.equal(view.state, before, "cancelled gesture cannot resume: " + inactive);
	}
	mouseTime += 2000;
	mouse("mousedown", 1, 0);
	const before = view.state;
	assert.ok(mouse("mousemove", 1, 0).defaultPrevented);
	assert.equal(view.state, before, "unchanged plain drag does not dispatch");
	mouse("mousemove", 1, 6);
	assert.notEqual(view.state, before, "changed plain drag dispatches");
	stop();
}
let timeout = 1800;
const stopTimed = installMathMouseSelection(
	win,
	() => {},
	() => timeout,
);
mouseTime = 100;
mouse("mousedown", 1);
mouse("mouseup", 1);
mouseTime += 1500;
mouse("mousedown", 1);
mouse("mouseup", 1);
assert.deepEqual(
	[view.state.selection.from, view.state.selection.to],
	[3, 6],
	"custom longer interval continues sequence",
);
mouseTime += 100;
mouse("mousedown", 1);
mouse("mouseup", 1);
assert.deepEqual([view.state.selection.from, view.state.selection.to], [2, 7], "later click expands");
timeout = 200;
mouseTime += 201;
mouse("mousedown", 1);
mouse("mouseup", 1);
assert.deepEqual([view.state.selection.from, view.state.selection.to], [4, 4], "updated shorter timeout starts over");
timeout = 5000;
win.document.dispatchEvent(new win.Event("latex-suite-settings-changed"));
mouseTime += 100;
mouse("mousedown", 1);
mouse("mouseup", 1);
assert.deepEqual([view.state.selection.from, view.state.selection.to], [4, 4], "reload resets in-progress sequence");
stopTimed();
let dispatches = 0,
	focuses = 0;
const originalDispatch = view.dispatch.bind(view);
view.dispatch = tr => {
	dispatches++;
	originalDispatch(tr);
};
view.focus = () => {
	focuses++;
};
const stopTap = installMathMouseSelection(win);
mouseTime = 10000;
mouse("mousedown", 1, 1);
mouse("mouseup", 1, 1);
mouse("click", 1, 1);
const afterClick = dispatches;
mouseTime += 3000;
assert.ok(mouse("click", 1, 6).defaultPrevented, "click-only tap handled");
assert.deepEqual(
	[view.state.selection.from, view.state.selection.to],
	[6, 6],
	"click-only tap moves caret instead of restoring old position",
);
assert.equal(dispatches, afterClick + 1, "release does not redundantly redispatch unchanged selection");
mouseTime += 2000;
mouse("mousedown", 1, 1);
mouse("mouseup", 1, 1);
mouseTime += 2000;
mouse("click", 1, 5);
assert.equal(view.state.selection.from, 5, "stale unfinished gesture cannot swallow later tap");
mouseTime += 2000;
mouse("click", 1, 4);
mouseTime += 100;
mouse("click", 2, 4);
assert.deepEqual([view.state.selection.from, view.state.selection.to], [3, 6], "click-only double tap selects word");
mouse("dblclick", 2, 4);
mouseTime += 100;
mouse("click", 3, 4);
assert.deepEqual(
	[view.state.selection.from, view.state.selection.to],
	[2, 7],
	"click-only third tap expands structure",
);
assert.ok(focuses > 0, "tap retains editor focus");
mouseTime += 100;
assert.equal(
	mouse("click", 1, 0, win.document.querySelector("p")).defaultPrevented,
	false,
	"outside click is not swallowed by stale gesture",
);
const saved = view.posAtCoords;
for (const lookup of [
	() => null,
	() => {
		throw new Error("layout unavailable");
	},
	() => ({ pos: NaN }),
]) {
	view.posAtCoords = lookup;
	mouseTime += 2000;
	assert.equal(
		mouse("mousedown", 1, 2).defaultPrevented,
		false,
		"failed coordinate lookup leaves native caret placement alone",
	);
	assert.equal(mouse("click", 1, 2).defaultPrevented, false, "failed tap lookup also passes through");
}
view.posAtCoords = saved;
mouseTime += 2000;
mouse("mousedown", 1, 1);
dom.dispatchEvent(new win.MouseEvent("mousemove", { clientX: 6, bubbles: true, cancelable: true, buttons: 0 }));
assert.equal(view.state.selection.from, 1, "hover motion after tap is not a drag");
win.dispatchEvent(new win.Event("blur"));
assert.equal(mouse("mouseup", 1, 1).defaultPrevented, false, "window blur cancels gesture");
stopTap();
assert.equal(mouse("click", 1, 4).defaultPrevented, false, "tap fallback removed on cleanup");
win.close();
