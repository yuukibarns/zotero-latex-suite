import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import katex from "katex-zotero";
import { Schema } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import {
	latexTokens,
	installMathHighlight,
	installMathVisibility,
	mathDelimiterIndex,
	concealRanges,
	concealDecorations,
} from "./build/test-exports.mjs";

assert.deepEqual(
	concealRanges(String.raw`\alpha+\lambda+\alphabeta`).map(r => r.symbol),
	["α", "λ"],
);
assert.deepEqual(
	concealRanges(String.raw`\text{\alpha} + \beta % \gamma`).map(r => r.symbol),
	["β"],
);
assert.deepEqual(
	concealRanges(String.raw`\verb|\alpha| + \beta`).map(r => r.symbol),
	["β"],
);
assert.deepEqual(
	concealRanges(String.raw`\begin{algorithm}\caption{\alpha}\STATE prose \beta $\gamma\gets x$\end{algorithm}`).map(
		r => r.symbol,
	),
	["γ", "←"],
);
assert.deepEqual(concealRanges(String.raw`\begin{tikzcd}\alpha\end{tikzcd}`), []);
const concealed = concealRanges(String.raw`x+\alpha+y`);
for (const source of [String.raw`\left(`, String.raw`\right\}`, String.raw`\middle|`, String.raw`\left.`]) {
	const ranges = concealRanges(source);
	assert.equal(ranges[0].className, "boundary");
	const decos = concealDecorations(ranges, source.length + 1, source.length + 1);
	if (ranges[0].symbol) assert(decos.some(d => d.type.attrs.class.includes("ls-conceal-boundary")));
	for (let p = 0; p <= source.length; p++) assert.equal(concealDecorations(ranges, p, p).length, 0);
}
{
	const source = String.raw`x_{i=1+\alpha}^{2}`;
	const ranges = concealRanges(source);
	assert.deepEqual(
		ranges.map(r => r.symbol),
		["i", "=", "1", "+", "α", "2"],
	);
	assert.deepEqual(
		ranges.map(r => r.className.split(" ").at(-1)),
		[
			"ls-conceal-script-text",
			"ls-conceal-script-operator",
			"ls-conceal-script-number",
			"ls-conceal-script-operator",
			"ls-conceal-script-command",
			"ls-conceal-script-number",
		],
	);
	for (let p = 1; p <= source.indexOf("}") + 1; p++)
		assert(
			!concealDecorations(ranges, p, p).some(d => ["i", "=", "1", "+", "α"].includes(d.type.attrs?.["data-symbol"])),
			"Entire script reveals together",
		);
}
for (const letters of ["A", "B", "AB", "Z"]) {
	const source = "\\mathscr{" + letters + "}^{3}";
	const anchor = concealDecorations(concealRanges(source), source.length + 1, source.length + 1).find(
		d => d.type.attrs?.["data-symbol"] === letters,
	);
	const rendered = new JSDOM(katex.renderToString("\\mathscr{" + letters + "}", { output: "html" }));
	const correction = rendered.window.document.querySelector(".mathscr").style.marginRight;
	assert.equal(
		anchor.type.attrs.style,
		"--ls-conceal-italic-correction:" + correction,
		"Script spacing follows KaTeX for " + letters,
	);
}
for (const command of ["sum", "prod", "coprod", "bigcup", "bigcap", "oint"]) {
	const decorations = concealDecorations(concealRanges("\\" + command), 100, 100);
	assert(
		decorations.some(d => d.type.attrs.class.includes("ls-conceal-font-Size1-Regular")),
		command + " uses compact operator font",
	);
}
for (const command of ["to", "longrightarrow", "mapsto"]) {
	const replacements = concealDecorations(concealRanges("\\" + command), 100, 100);
	assert(
		replacements.some(d => d.type.attrs.class.includes("ls-conceal-font-Main-Regular")),
		command + " uses verified math glyph font",
	);
}
assert.equal(concealRanges(String.raw`\text{Rescale}`)[0].className, "text", "Text conceal keeps its semantic color");
assert.equal(
	concealRanges(String.raw`\operatorname{Rescale}`)[0].className,
	"roman",
	"Operators remain distinct from prose",
);
for (const [source, expected] of [
	[String.raw`\boldsymbol{P}^{\mathrm{blk}}`, ["", "", "", ""]],
	[String.raw`\mathbf{AB}+\mathrm{foo}+\underline{x}`, ["", "", "", "", "", ""]],
	[String.raw`\mathbb{E}\mathbb{R}\mathcal{F}\mathfrak{g}`, ["E", "R", "F", "𝔤"]],
	[String.raw`\Rightarrow\implies\Leftarrow\impliedby\Leftrightarrow\iff`, ["⇒", "⟹", "⇐", "⟸", "⇔", "⟺"]],
	[String.raw`\frac{1}{2}+\dfrac{a}{b}`, []],
	[String.raw`x_{ij}+y^2+\sin x+\not\in A`, ["ij", "2", "sin", "∉"]],
	[String.raw`\left\langle x\right\rangle`, ["⟨", "⟩"]],
	[String.raw`\longmapsto\nsubseteq\varnothing`, ["⟼", "⊈", "∅"]],
])
	assert.deepEqual(
		concealRanges(source)
			.filter(r => !r.styleOnly)
			.map(r => r.symbol),
		expected,
		source,
	);
for (const source of [String.raw`\mathbb{?}`, String.raw`\unknown{x}`, String.raw`\frac{a}`])
	assert.equal(concealRanges(source).length, 0, "Unsupported/incomplete form stays visible: " + source);
for (const source of [String.raw`\boldsymbol{x+\beta}`]) {
	const ranges = concealRanges(source);
	for (let p = 0; p <= source.length; p++)
		assert.equal(concealDecorations(ranges, p, p).length, 0, "Compound reveal at " + p + " in " + source);
	const decos = concealDecorations(ranges, source.length + 1, source.length + 1);
	assert(decos.length > 0);
	for (const r of ranges) assert(r.from >= 0 && r.to <= source.length && r.from < r.to);
}
// Exercise every malformed prefix of a nested expression, including UTF-16.
for (const command of ["frac", "dfrac", "tfrac", "gfrac"]) {
	const source = "\\" + command + "{\\alpha}" + (command.endsWith("frac") ? "{\\beta}" : "");
	const ranges = concealRanges(source);
	assert.deepEqual(
		ranges.map(r => source.slice(r.from, r.to)),
		command.endsWith("frac") ? ["\\alpha", "\\beta"] : ["\\alpha"],
		"Only arguments conceal: " + command,
	);
}
for (const command of [
	"vec",
	"hat",
	"widehat",
	"tilde",
	"widetilde",
	"bar",
	"overline",
	"dot",
	"ddot",
	"dddot",
	"ddddot",
]) {
	const source = "\\" + command + "{\\beta}";
	assert.deepEqual(
		concealRanges(source).map(r => source.slice(r.from, r.to)),
		["\\beta"],
		"Accent wrapper stays visible",
	);
}
for (const command of ["mathbf", "bm", "boldsymbol", "mathit", "mathrm", "underline"]) {
	const source = "\\" + command + "{x+\\alpha}";
	const ranges = concealRanges(source);
	assert(ranges.some(r => r.styleOnly));
	assert(
		ranges.some(r => r.symbol === "α"),
		"Nested symbol conceal preserved",
	);
	for (let p = 0; p <= source.length; p++)
		assert.equal(concealDecorations(ranges, p, p).length, 0, "Formatting reveals as a group");
	for (const d of concealDecorations(ranges, source.length + 1, source.length + 1))
		assert(d.from < d.to, "Inline-only conceal, no widgets");
}
for (const command of ["mathbf", "bm", "boldsymbol", "mathit", "mathrm", "underline"]) {
	for (const script of ["_", "^"]) {
		const source = `x${script}{\\${command}{x+1\\alpha}}`;
		const ranges = concealRanges(source);
		assert.deepEqual(
			ranges.filter(r => r.symbol).map(r => r.symbol),
			["α"],
		);
		assert.ok(
			ranges.every(r => r.from > 1 && r.to < source.length),
			"outer script syntax remains visible",
		);
		assert.ok(
			ranges.some(r => r.styleOnly),
			"inner formatting still conceals",
		);
	}
	const source = `\\${command}{x+1\\mathit{y}\\alpha}`;
	const ranges = concealRanges(source);
	assert.equal(ranges.filter(r => r.styleOnly).length, 2, "nested formatting remains independent");
	assert.deepEqual(
		ranges.filter(r => r.symbol).map(r => r.symbol),
		["α"],
		"original plain content remains highlighted",
	);
	for (let p = 0; p <= source.length; p++)
		assert.equal(concealDecorations(ranges, p, p).length, 0, "nested wrapper reveals together");
}
for (const body of [
	String.raw`x_T\sim p_T(\cdot\mid x_0)`,
	String.raw`\hat{x}+\alpha`,
	String.raw`\frac{a}{b_i}`,
	String.raw`\sin x`,
	String.raw`\mathbb{R}`,
]) {
	const source = `E_{${body}}`,
		ranges = concealRanges(source);
	assert.ok(ranges.length, "eligible inner conceal survives: " + body);
	assert.ok(
		ranges.every(r => r.from > 1 && r.to < source.length),
		"complex outer script stays literal: " + body,
	);
}
{
	const source = String.raw`E_{x_T+p_T+x_0}`,
		ranges = concealRanges(source);
	assert.deepEqual(
		ranges.map(r => r.symbol),
		["T", "T", "0"],
	);
	assert.equal(
		concealDecorations(ranges, source.indexOf("T"), source.indexOf("T")).filter(d => d.type.attrs?.["data-symbol"])
			.length,
		2,
		"editing inner script does not reveal siblings",
	);
}
for (const source of [
	String.raw`\boldsymbol{\alpha`,
	String.raw`\mathrm{\alpha % comment
}`,
])
	assert.deepEqual(
		concealRanges(source)
			.filter(r => r.symbol)
			.map(r => r.symbol),
		["α"],
		"invalid wrapper preserves eligible inner conceal",
	);
for (const arg of ["i", "{i}", String.raw`\alpha`])
	for (const gap of ["", " ", "\t"]) {
		const source = "x_" + gap + arg,
			ranges = concealRanges(source);
		assert.equal(ranges.length, 1, "one argument: " + source);
		assert.equal(ranges[0].symbol, arg.includes("alpha") ? "α" : "i");
		assert.equal(ranges[0].from, 1);
		assert.equal(ranges[0].to, source.length);
	}
for (const source of ["x_", "x_\\", "x_  ", "x_{", "x_\nq", "x_% comment\nq"])
	assert.equal(concealRanges(source).length, 0, "incomplete/comment/newline stays visible: " + source);
for (const name of ["sqrt", "choose", "frac", "unknown", "alphaUnknown"])
	for (const source of ["\\" + name, "x_\\" + name, "x_{\\" + name + "}"])
		assert.equal(concealRanges(source).length, 0, "same command eligibility inside and outside scripts: " + source);
for (const source of [String.raw`x_i^2`, String.raw`x_{i+1}^{\alpha}`, String.raw`x_{a_j+\unknown{\beta}}`]) {
	const ranges = concealRanges(source),
		replacements = ranges.filter(r => !r.styleOnly);
	for (let i = 1; i < replacements.length; i++)
		assert.ok(replacements[i - 1].to <= replacements[i].from, "replacement spans never overlap");
	for (const r of ranges)
		for (const p of [r.from, r.to])
			assert.ok(
				concealDecorations(ranges, p, p).every(d => d.to <= r.from || d.from >= r.to),
				"caret at either boundary reveals touched replacement",
			);
	assert.equal(concealDecorations(ranges, 0, source.length).length, 0, "full selection reveals source");
}
const nested = String.raw`😀+\frac{\boldsymbol{\alpha+x}}{\mathbb{R}_{i}}+\unknown{z}`;
for (let end = 0; end <= nested.length; end++) {
	const ranges = concealRanges(nested.slice(0, end));
	for (const r of ranges) assert(r.from >= 0 && r.to <= end && r.from < r.to);
	assert.equal(concealDecorations(ranges, 0, end).length, 0, "Selecting all reveals all");
}
for (const [from, to] of [
	[2, 2],
	[4, 4],
	[8, 8],
	[0, 9],
	[3, 7],
])
	assert.equal(
		concealDecorations(concealed, from, to).length,
		0,
		"cursor/selection reveals entire command including boundaries",
	);
assert.equal(concealDecorations(concealed, 0, 0).length, 2);

const pieces = source => latexTokens(source).map(t => [source.slice(t.from, t.to), t.kind]);
for (const [command, font] of [
	["mathbb", "AMS-Regular"],
	["mathcal", "Caligraphic-Regular"],
	["mathscr", "Script-Regular"],
]) {
	const source = "\\" + command + "{ABCDEFGHIJKLMNOPQRSTUVWXYZ}";
	const ranges = concealRanges(source);
	assert.equal(ranges[0].symbol, "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
	assert.equal(ranges[0].font, font);
	assert(
		concealDecorations(ranges, source.length + 1, source.length + 1).some(d =>
			d.type.attrs.class.includes("ls-conceal-font-" + font),
		),
	);
	for (let p = 0; p <= source.length; p++) assert.equal(concealDecorations(ranges, p, p).length, 0);
	assert.equal(concealRanges("\\" + command + "{a?}").length, 0);
}
const matched = (source, at) =>
	mathDelimiterIndex(source)
		.get(at)
		?.partners?.map(r => source.slice(r.from, r.to));
assert.deepEqual(matched("(x)", 0), ["(", ")"]);
for (const source of [
	"(x | y)",
	"(x |\n y)",
	String.raw`(x_{t}^{i} | x_{t - \Delta t}^{i})`,
	String.raw`\left(x | y\right)`,
	"{t | y}",
]) {
	const at = source.startsWith("\\left") ? 0 : source.indexOf(source[0]);
	assert.ok(
		mathDelimiterIndex(source).get(at)?.partners,
		"conditional bar must not block a surrounding pair: " + source,
	);
}
assert.deepEqual(matched("(a+|b|)", 0), ["(", ")"], "completed absolute value remains nested");
assert.deepEqual(matched("(x)", 1), ["(", ")"]);
assert.deepEqual(matched("(x)", 3), ["(", ")"]);
assert.deepEqual(matched("{[x+(y)]}", 5), ["(", ")"], "nearest nested pair");
assert.deepEqual(matched(String.raw`\langle x \rangle`, 3), ["\\langle", "\\rangle"]);
const scaled = String.raw`\left( x \middle| y \right)`;
for (const at of [0, 4, 6, scaled.indexOf("\\middle") + 3, scaled.length])
	assert.deepEqual(matched(scaled, at), ["\\left(", "\\middle|", "\\right)"]);
assert.equal(mathDelimiterIndex("(x]").get(0)?.partners, undefined, "mismatched opener marked unmatched");
assert.equal(mathDelimiterIndex("(x]").get(2)?.partners, undefined, "mismatched closer marked unmatched");
assert.equal(mathDelimiterIndex("x+% (y)").get(5), undefined, "comments excluded");
assert.equal(mathDelimiterIndex(String.raw`\verb|(x)|`).get(6), undefined, "verbatim excluded");
assert.equal(mathDelimiterIndex(String.raw`\text{(x) \langle y \rangle}`).get(7), undefined, "literal parens excluded");
assert.equal(
	mathDelimiterIndex(String.raw`\text{(x) \langle y \rangle}`).get(12),
	undefined,
	"literal named delimiters excluded",
);
assert.equal(mathDelimiterIndex("|x|").get(0), undefined, "ambiguous bare bars excluded");
for (const bar of ["|", "||", "\\|"])
	assert.equal(mathDelimiterIndex(`${bar}x${bar}`).size, 0, "bare bars never receive pair decorations");
for (const bar of ["|", "\\|"]) {
	const source = `\\left${bar} x \\middle| y \\right${bar}`;
	assert.deepEqual(matched(source, 0), [`\\left${bar}`, "\\middle|", `\\right${bar}`], "scalable bars still pair");
}
assert.deepEqual(matched(String.raw`\lvert x \rvert`, 0), ["\\lvert", "\\rvert"]);
assert.deepEqual(matched(String.raw`\left. x \right|`, 0), ["\\left.", "\\right|"]);
assert.deepEqual(pieces("\\frac{x_1}{y^2}"), [
	["\\frac", "command"],
	["{", "brace"],
	["_", "operator"],
	["1", "number"],
	["}", "brace"],
	["{", "brace"],
	["^", "operator"],
	["2", "number"],
	["}", "brace"],
]);
// Compare exact UTF-16 spans with pinned upstream markup fixtures, rather
// than duplicating our own implementation in expected test data.
for (const [fixture, upstreamClass, kind] of [
	["control_sequences", "hljs-keyword", "command"],
	["parameters", "hljs-params", "parameter"],
]) {
	const base = new URL(`./test-fixtures/highlightjs-latex/${fixture}`, import.meta.url);
	const input = readFileSync(new URL(base + ".txt"), "utf8");
	const markup = readFileSync(new URL(base + ".expect.txt"), "utf8");
	const dom = new JSDOM(`<body>${markup}</body>`);
	assert.equal(dom.window.document.body.textContent, input);
	let offset = 0;
	const expected = [];
	function visit(node) {
		const start = offset;
		if (node.nodeType === 3) offset += node.textContent.length;
		else {
			for (const child of node.childNodes) visit(child);
			if (node.classList?.contains(upstreamClass)) expected.push([start, offset]);
		}
	}
	visit(dom.window.document.body);
	assert.deepEqual(
		latexTokens(input)
			.filter(t => t.kind === kind)
			.map(t => [t.from, t.to]),
		expected,
		`${fixture}: upstream token boundaries`,
	);
	dom.window.close();
}
assert.deepEqual(
	pieces("^^3a ^^^abcd ^^^^abcd #789 ##1 12.5 .25").filter(([, k]) => ["escape", "parameter", "number"].includes(k)),
	[
		["^^3a", "escape"],
		["^^^abc", "escape"],
		["^^^^abcd", "escape"],
		["#7", "parameter"],
		["89", "number"],
		["##1", "parameter"],
		["12.5", "number"],
		[".25", "number"],
	],
);
const commentFixture = readFileSync(new URL("./test-fixtures/highlightjs-latex/comments.txt", import.meta.url), "utf8");
assert.deepEqual(
	pieces(commentFixture)
		.filter(([, k]) => k === "comment")
		.map(([s]) => s),
	commentFixture
		.split("\n")
		.filter(line => line.includes("%"))
		.map(line => line.slice(line.indexOf("%"))),
	"upstream ordinary and magic comments remain comments",
);
const verbFixture = readFileSync(
	new URL("./test-fixtures/highlightjs-latex/verbatim.txt", import.meta.url),
	"utf8",
).split("\n")[0];
assert.equal(
	pieces(verbFixture).filter(([, k]) => k === "comment").length,
	0,
	"upstream verbatim examples do not create comments",
);
assert.deepEqual(pieces("\\% + % comment\n\\alpha"), [
	["\\%", "command"],
	["+", "operator"],
	["% comment", "comment"],
	["\\alpha", "command"],
]);
assert.deepEqual(pieces("\\{x\\}\\\\"), [
	["\\{", "command"],
	["\\}", "command"],
	["\\\\", "command"],
]);
const source = "\\text{target {nested}} + x_1 + \\text {a\\%b}";
const tokens = pieces(source);
assert.ok(tokens.some(([s, k]) => s === "nested" && k === "text"));
assert.ok(
	tokens.some(([s, k]) => s === "_" && k === "operator"),
	"text mode ends after nested braces",
);
assert.deepEqual(
	pieces("\\begin{aligned}x&=y\\end{aligned}").filter(([, k]) => k === "environment"),
	[
		["aligned", "environment"],
		["aligned", "environment"],
	],
);
assert.deepEqual(
	pieces("\\text{hello\nworld}").filter(([, k]) => k === "text"),
	[
		["hello", "text"],
		["world", "text"],
	],
);
for (const s of ["\\", "\\text{unfinished", "\\frac{", "}", "😀+\\alpha", ""]) {
	for (const t of latexTokens(s)) assert.ok(t.from >= 0 && t.to <= s.length && t.from < t.to);
}
assert.equal(latexTokens("😀\\alpha")[0].from, 2, "UTF-16 offsets");
assert.deepEqual(
	pieces("\\😀+x"),
	[
		["\\😀", "command"],
		["+", "operator"],
	],
	"escaped non-BMP symbol is not split",
);
for (const delimiter of [
	["$", "$"],
	["$$", "$$"],
	["\\(", "\\)"],
	["\\[", "\\]"],
]) {
	const s = `\\text{before ${delimiter[0]}x_1+\\alpha${delimiter[1]} after} + y_2`;
	const tokens = latexTokens(s);
	const inner = s.indexOf("_1"),
		outer = s.indexOf("_2");
	assert.ok(
		tokens.some(t => t.from === inner && t.kind === "operator"),
		"nested math inside text is recognized",
	);
	assert.ok(
		tokens.some(t => t.from === outer && t.kind === "operator"),
		"outer math remains active",
	);
	assert.ok(
		tokens.some(t => t.kind === "text" && s.slice(t.from, t.to) === "after"),
		"text resumes after inner math",
	);
}
for (const s of ["\\text{a $x_1} + y_2", "\\text{a \\(x_1} + y_2"]) {
	assert.ok(
		latexTokens(s).some(t => t.from === s.indexOf("_2") && t.kind === "operator"),
		"incomplete nested math is contained by its text group",
	);
}
assert.deepEqual(
	pieces("\\verb|{%\\x}| + x_1").filter(([, k]) => k === "text"),
	[["{%\\x}", "text"]],
);
assert.deepEqual(
	pieces("\\verb*+a%b+").filter(([, k]) => k === "comment"),
	[],
	"verbatim percent is literal",
);
assert.ok(
	pieces("\\verb|unfinished\n% comment").some(([s, k]) => s === "% comment" && k === "comment"),
	"incomplete verbatim ends at newline",
);
assert.ok(pieces("\\operatorname*{arg max}_x").some(([s, k]) => s === "\\operatorname*" && k === "command"));
assert.ok(pieces("\\operatorname*{arg max}_x").some(([s, k]) => s === "arg" && k === "text"));
assert.ok(
	pieces("\\text%comment\r\n{target}_x").some(([s, k]) => s === "target" && k === "text"),
	"comments preserve pending text argument",
);
assert.ok(
	pieces("\\text{a\\$b}_x").some(([s, k]) => s === "b" && k === "text"),
	"escaped dollar does not switch modes",
);
// Deterministic fuzzing of malformed prefixes: every iteration must advance,
// ranges must remain ordered/in-bounds, and scanning must never modify input.
let seed = 1234567;
const alphabet = [
	"\\",
	"{",
	"}",
	"$",
	"%",
	"\n",
	"\r",
	" ",
	"a",
	"_",
	"*",
	"😀",
	"\u00a0",
	"@",
	":",
	"^",
	"#",
	"1",
	".",
];
for (let n = 0; n < 1000; n++) {
	let s = "";
	for (let j = 0; j < 80; j++) {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		s += alphabet[seed % alphabet.length];
	}
	let end = 0;
	for (const t of latexTokens(s)) {
		assert.ok(t.from >= end && t.to > t.from && t.to <= s.length);
		end = t.to;
	}
}
assert.deepEqual(
	pieces("x").filter(([, kind]) => kind === "environment"),
	[],
	"enclosing math scope is not an environment-name token",
);
assert.ok(pieces("\\operatorname{argmax}").some(([s, k]) => s === "\\operatorname" && k === "command"));
for (const s of [
	"\\alpha\r\n+\\beta",
	"\\text{target {label}} x_1",
	"\\begin{aligned}\nx&=\\alpha\\\\\ny&=\\beta\n\\end{aligned}",
]) {
	const tokens = latexTokens(s);
	assert.ok(tokens.length);
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		assert.ok(t.from >= 0 && t.to <= s.length && t.from < t.to);
		if (i) assert.ok(tokens[i - 1].to <= t.from, "token ranges are ordered and do not overlap");
	}
}

const win = new JSDOM(
	'<html><head></head><body><math-inline class="math-node"><div></div></math-inline></body></html>',
	{ pretendToBeVisual: true },
).window;
const stopVisibility = installMathVisibility(win);
const visibility = win.document.getElementById("latex-suite-math-visibility");
const rules = Array.from(visibility.sheet.cssRules);
assert.ok(
	rules.every(rule => rule.selectorText.startsWith(".math-node .math-src .ProseMirror")),
	"visibility overrides are scoped to inner math",
);
assert.ok(
	rules.some(rule => rule.style.getPropertyValue("caret-color")),
	"caret explicitly restored",
);
for (const pseudo of ["::selection", "::-moz-selection"])
	assert.ok(
		rules.some(
			rule =>
				rule.selectorText.endsWith(pseudo) && rule.style.getPropertyValue("background").toLowerCase() === "highlight",
		),
		"native selection colors restored",
	);
stopVisibility();
stopVisibility();
assert.equal(win.document.getElementById("latex-suite-math-visibility"), null, "visibility cleanup is idempotent");
const node = win.document.querySelector("math-inline");
const schema = new Schema({ nodes: { doc: { content: "text*" }, text: {} } });
const state = EditorState.create({ schema, doc: schema.node("doc", null, schema.text("\\alpha+x")) });
let updates = 0;
const original = state.doc.toJSON();
const previous = state => DecorationSet.create(state.doc, [Decoration.inline(0, 1, { class: "existing-decoration" })]);
const view = {
	dom: node.firstChild,
	state,
	props: { decorations: previous },
	isDestroyed: false,
	setProps(props) {
		this.props = { ...this.props, ...props };
		updates++;
	},
};
node.pmViewDesc = { spec: { _innerView: view } };
const tick = () => new Promise(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));
const stop = installMathHighlight(win);
await tick();
assert.ok(
	win.document
		.getElementById("latex-suite-math-highlight")
		.textContent.includes("math-inline.math-node .math-src .ProseMirror{white-space:break-spaces}"),
	"highlighting preserves browser whitespace at decoration boundaries",
);
assert.equal(updates, 1);
const decorated = view.props.decorations(state);
assert.ok(decorated.find().some(d => d.type.attrs.class === "ls-tex-command"));
assert.ok(
	decorated.find().some(d => d.type.attrs.class === "existing-decoration"),
	"existing direct decorations preserved",
);
assert.deepEqual(state.doc.toJSON(), original, "source and stored schema unchanged");
view.state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
view.props.decorations(view.state);
assert.deepEqual(view.state.doc.toJSON(), original, "selection-only changes do not modify source");
view.state = view.state.apply(view.state.tr.insertText("\\beta", 0, 6));
assert.equal(
	view.props
		.decorations(view.state)
		.find()
		.find(d => d.type.attrs.class === "ls-tex-command").to,
	5,
	"source changes retokenized",
);
await tick();
assert.equal(updates, 1, "no repeated attachment");
stop();
assert.equal(view.props.decorations, previous);
assert.equal(win.document.getElementById("latex-suite-math-highlight"), null);
await tick();
assert.equal(updates, 2, "cleanup cancels pending updates");
const stopAgain = installMathHighlight(win);
await tick();
view.isDestroyed = true;
node.remove();
await tick();
stopAgain();
view.isDestroyed = false;
win.document.body.append(node);
view.props = {};
const stopThird = installMathHighlight(win);
await tick();
const cached = view.props.decorations(view.state);
const selected = view.state.apply(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
assert.equal(view.props.decorations(selected), cached, "selection-only updates reuse the decoration set");
view.state = view.state.apply(view.state.tr.insertText("(x)", 0, view.state.doc.content.size));
view.state = view.state.apply(view.state.tr.setSelection(TextSelection.create(view.state.doc, 0)));
const pairDecorations = view.props.decorations(view.state);
assert.equal(pairDecorations.find().filter(d => d.type.attrs.class === "ls-tex-match").length, 2);
const moved = view.state.apply(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
assert.equal(
	view.props
		.decorations(moved)
		.find()
		.filter(d => d.type.attrs.class === "ls-tex-match").length,
	2,
	"caret on partner updates pair",
);
const rangeSelected = view.state.apply(view.state.tr.setSelection(TextSelection.create(view.state.doc, 0, 3)));
assert.equal(
	view.props
		.decorations(rangeSelected)
		.find()
		.filter(d => d.type.attrs.class === "ls-tex-match").length,
	0,
	"range selections clear matching",
);
view.state = view.state.apply(view.state.tr.insertText("(x", 0, view.state.doc.content.size));
view.state = view.state.apply(view.state.tr.setSelection(TextSelection.create(view.state.doc, 0)));
assert.equal(
	view.props
		.decorations(view.state)
		.find()
		.filter(d => d.type.attrs.class === "ls-tex-unmatched").length,
	1,
	"unmatched delimiter gets warning decoration",
);
const replacement = () => DecorationSet.empty;
view.props.decorations = replacement;
stopThird();
assert.equal(view.props.decorations, replacement, "cleanup preserves another extension replacing the provider");
view.props = {};
view.state = state;
view.dom.style.fontSize = "14px";
const stopConceal = installMathHighlight(win, true, false);
await tick();
view.state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 8)));
assert.equal(view.props.decorations(view.state).find().length, 2, "conceal works independently of highlighting");
assert.equal(
	view.props
		.decorations(view.state)
		.find()
		.find(d => d.type.attrs["data-symbol"]).type.attrs["data-symbol"],
	"α",
);
const stable = view.props.decorations(view.state);
assert.equal(view.props.decorations(view.state), stable, "Identical updates retain decorations");
const adjacent = view.state.apply(view.state.tr.setSelection(TextSelection.create(view.state.doc, 7)));
assert.equal(
	view.props.decorations(adjacent),
	stable,
	"Movement with unchanged conceal visibility retains decorations",
);
view.dom.style.fontSize = "20px";
view.dom.style.color = "rgb(12, 34, 56)";
await tick();
assert.equal(
	view.dom.style.getPropertyValue("--ls-conceal-font-size"),
	"20px",
	"Font metrics refresh without text edits",
);
assert.equal(
	view.dom.style.getPropertyValue("--ls-conceal-text-color"),
	"rgb(12, 34, 56)",
	"Text color refreshes without text edits",
);
view.composing = true;
assert.equal(view.props.decorations(view.state).find().length, 0, "IME composition reveals source");
view.composing = false;
assert.deepEqual(view.state.doc.toJSON(), original, "conceal does not alter source");
stopConceal();
assert.equal(view.props.decorations, undefined);
assert.equal(view.dom.style.getPropertyValue("--ls-conceal-font-size"), "");
assert.equal(view.dom.style.getPropertyValue("--ls-conceal-text-color"), "");
win.close();
console.log("LaTeX tokens, escaped symbols, nested text, decorations, caching and cleanup passed.");
