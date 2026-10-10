import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { installMathNodes, isTikzcd } from "../build/note-integration.mjs";
const source = String.raw`\begin{tikzcd} A \arrow[r] & B \end{tikzcd}`;
const pause = () => new Promise(r => setTimeout(r, 10));
function setup(text = source) {
	const dom = new JSDOM("<!doctype html><head></head><body></body>");
	const doc = dom.window.document;
	const node = doc.createElement("math-display");
	doc.body.append(node);
	const rendered = doc.createElement("span"),
		src = doc.createElement("span");
	node.append(rendered, src);
	class MathView {
		constructor() {
			this.dom = node;
			this._mathRenderElt = rendered;
			this._mathSrcElt = src;
			this._outerView = {};
			this._node = { textContent: text };
			this.calls = 0;
		}
		renderMath() {
			this.calls++;
			rendered.textContent = "native:" + this._node.textContent;
		}
		update(value) {
			this._node = { textContent: value };
			if (this._innerView) this._innerView.state.doc = this._node;
			else this.renderMath();
			return true;
		}
		openEditor() {
			this._innerView = { state: { doc: this._node } };
		}
		closeEditor() {
			this._innerView = null;
			this.renderMath();
		}
		destroy() {
			node.remove();
		}
	}
	const math = new MathView();
	node.pmViewDesc = { spec: math };
	math.renderMath();
	const jobs = [];
	const render = (host, text, { signal }) =>
		new Promise((resolve, reject) => jobs.push({ host, text, signal, resolve, reject }));
	function finish(job = jobs.at(-1)) {
		const element = doc.createElement("div");
		element.className = "tikzcd-diagram";
		element.textContent = job.text;
		job.host.append(element);
		job.resolve({ element, diagnostics: [], dispose: () => element.remove() });
		return element;
	}
	const controller = installMathNodes(doc, { render, debounce: 0 });
	return { dom, doc, node, math, jobs, finish, controller };
}
test("recognises only standalone tikzcd starts", () => {
	assert.ok(isTikzcd(source));
	assert.ok(isTikzcd("% quiver URL\n" + source));
	assert.ok(isTikzcd("\\[\n" + source + "\\]"));
	assert.ok(!isTikzcd("x + " + source));
	assert.ok(!isTikzcd("\\begin{matrix}a\\end{matrix}"));
});
test("export uses requested typography and returns nonfatal warnings", async () => {
	const x = setup("a+b");
	const request = { node: x.node, math: { _node: { textContent: source } }, fontSize: "18pt", warnings: [] };
	x.doc.dispatchEvent(new x.dom.window.CustomEvent("latex-suite-export-math", { detail: request }));
	const job = x.jobs.at(-1);
	assert.equal(job.host.style.fontSize, "18pt");
	const element = x.doc.createElement("div");
	job.host.append(element);
	job.resolve({
		element,
		diagnostics: [{ severity: "warning", message: "Ignored spacing" }],
		dispose: () => element.remove(),
	});
	assert.ok(await request.rendered);
	assert.deepEqual(request.warnings, ["Ignored spacing"]);
	assert.ok(!job.host.isConnected);
	x.controller.dispose();
	x.dom.window.close();
});
test("export rejects fatal diagnostics and cleans staging content", async () => {
	const x = setup("a+b");
	const request = { node: x.node, math: { _node: { textContent: source } }, fontSize: "12pt", warnings: [] };
	x.doc.dispatchEvent(new x.dom.window.CustomEvent("latex-suite-export-math", { detail: request }));
	const job = x.jobs.at(-1),
		element = x.doc.createElement("div");
	job.resolve({
		element,
		diagnostics: [{ severity: "error", message: "Invalid diagram" }],
		dispose: () => element.remove(),
	});
	await assert.rejects(request.rendered, /Invalid diagram/);
	assert.ok(!job.host.isConnected);
	x.controller.dispose();
	x.dom.window.close();
});
test("unknown MathView shapes are left untouched", () => {
	const x = setup("a+b");
	x.controller.dispose();
	delete x.math._node;
	const original = x.math.renderMath,
		controller = installMathNodes(x.doc);
	assert.equal(controller.count, 0);
	assert.equal(x.math.renderMath, original);
	controller.dispose();
	x.dom.window.close();
});
test("closed render stays in native render element; editing does not render", async () => {
	const x = setup();
	await pause();
	x.finish();
	await pause();
	assert.ok(x.math._mathRenderElt.querySelector(".tikzcd-diagram"));
	assert.equal(x.math._node.textContent, source);
	x.math.openEditor();
	assert.equal(x.node.querySelector(".tikzcd-note-surface").parentNode, x.math._mathRenderElt);
	x.math.update(source.replace("A", "X"));
	await pause();
	assert.equal(x.jobs.length, 1);
	x.math.update(source);
	x.math.closeEditor();
	assert.equal(x.jobs.length, 1);
	assert.equal(x.node.querySelector(".tikzcd-note-surface").parentNode, x.math._mathRenderElt);
	x.controller.dispose();
	assert.equal(x.node.getAttribute("data-tikzcd"), null);
	assert.equal(x.math._mathRenderElt.textContent, "native:" + source);
	x.dom.window.close();
});
test("shared preview reuses output, renders edits and releases without extra panel", async () => {
	const x = setup();
	await pause();
	x.finish();
	await pause();
	x.math.openEditor();
	const host = x.doc.createElement("div");
	x.node.append(host);
	const request = { math: x.math, output: host, debounceMs: 0, handled: false };
	const send = () =>
		x.doc.dispatchEvent(new x.dom.window.CustomEvent("latex-suite-preview-request", { detail: request }));
	send();
	assert.ok(request.handled);
	assert.ok(host.querySelector(".tikzcd-diagram"));
	assert.equal(x.jobs.length, 1);
	x.math.update(source.replace("A", "X"));
	send();
	await pause();
	assert.equal(x.jobs.length, 2);
	x.finish();
	await pause();
	send();
	await pause();
	assert.equal(x.jobs.length, 2, "caret-only refresh does not render");
	x.doc.dispatchEvent(new x.dom.window.CustomEvent("latex-suite-preview-release", { detail: { math: x.math } }));
	assert.ok(!host.querySelector(".tikzcd-diagram"));
	assert.ok(x.math._mathRenderElt.querySelector(".tikzcd-diagram"));
	x.math.update(source.replace("A", "Y"));
	await pause();
	assert.equal(x.jobs.length, 2, "released preview does not render");
	x.controller.dispose();
	x.dom.window.close();
});
test("preview edits debounce silently and release cancels pending work", async () => {
	const x = setup();
	await pause();
	x.finish();
	await pause();
	x.math.openEditor();
	const host = x.doc.createElement("div");
	x.node.append(host);
	const pending = new Map();
	let id = 0;
	x.dom.window.setTimeout = (fn, delay) => {
		pending.set(++id, { fn, delay });
		return id;
	};
	x.dom.window.clearTimeout = key => pending.delete(key);
	const send = () =>
		x.doc.dispatchEvent(
			new x.dom.window.CustomEvent("latex-suite-preview-request", {
				detail: { math: x.math, output: host, debounceMs: 250, handled: false },
			}),
		);
	send();
	for (const label of ["X", "Y", "Z"]) {
		x.math.update(source.replace("A", label));
		send();
	}
	assert.equal(x.jobs.length, 1);
	assert.equal(pending.size, 1);
	assert.equal(host.querySelector(".tikzcd-note-status").textContent, "");
	assert.ok(host.querySelector(".tikzcd-diagram"), "previous diagram remains visible");
	const [key, timer] = [...pending][0];
	assert.equal(timer.delay, 250);
	send();
	assert.equal([...pending][0][0], key, "caret refresh does not restart debounce");
	pending.delete(key);
	timer.fn();
	assert.equal(x.jobs.length, 2);
	assert.equal(x.jobs[1].text, source.replace("A", "Z"));
	x.finish();
	await pause();
	x.math.update(source.replace("A", "W"));
	send();
	assert.equal(pending.size, 1);
	x.doc.dispatchEvent(new x.dom.window.CustomEvent("latex-suite-preview-release", { detail: { math: x.math } }));
	assert.equal(pending.size, 0);
	assert.equal(x.jobs.length, 2);
	x.controller.dispose();
	x.dom.window.close();
});
test("late async completion cannot overwrite a newer source", async () => {
	const x = setup();
	await pause();
	const first = x.jobs[0];
	x.math.update(source.replace("A", "X"));
	await pause();
	assert.ok(first.signal.aborted);
	x.finish(x.jobs[1]);
	await pause();
	const stale = x.finish(first);
	await pause();
	assert.ok(!stale.isConnected);
	assert.equal(x.node.querySelectorAll(".tikzcd-diagram").length, 1);
	assert.ok(x.node.querySelector(".tikzcd-diagram").textContent.includes("X"));
	x.controller.dispose();
	x.dom.window.close();
});
test("typing an ordinary equation restores native rendering", async () => {
	const x = setup();
	await pause();
	x.finish();
	await pause();
	x.math.openEditor();
	x.math.update("a+b");
	assert.ok(!x.node.hasAttribute("data-tikzcd"));
	assert.equal(x.math._mathRenderElt.textContent, "native:a+b");
	x.controller.dispose();
	x.dom.window.close();
});
test("ordinary equations and detached preview facades delegate unchanged", async () => {
	const x = setup("a+b");
	x.math.renderMath();
	await pause();
	assert.equal(x.jobs.length, 0);
	assert.equal(x.math.calls, 2);
	const facade = { calls: 0, _node: { textContent: "facade" } };
	x.math.renderMath.call(facade);
	assert.equal(facade.calls, 1);
	assert.equal(x.jobs.length, 0);
	x.controller.dispose();
	x.dom.window.close();
});
test("destroy aborts render and removes retained state", async () => {
	const x = setup();
	await pause();
	x.math.destroy();
	assert.ok(x.jobs[0].signal.aborted);
	assert.equal(x.controller.count, 0);
	const late = x.finish();
	await pause();
	assert.ok(!late.isConnected);
	x.controller.dispose();
	x.dom.window.close();
});
test("syntax errors retain the previous diagram with an explicit message", async () => {
	const x = setup();
	await pause();
	x.finish();
	await pause();
	x.math.openEditor();
	x.math.update("\\begin{tikzcd} A");
	x.math.closeEditor();
	await pause();
	x.jobs.at(-1).reject(new Error("Missing end"));
	await pause();
	assert.equal(x.node.querySelectorAll(".tikzcd-diagram").length, 1);
	assert.match(x.node.querySelector(".tikzcd-note-status").textContent, /Showing previous diagram.*Missing end/);
	x.controller.dispose();
	x.dom.window.close();
});
test("disable does not overwrite a newer third-party wrapper", async () => {
	const x = setup();
	await pause();
	const old = x.math.renderMath;
	function other() {
		return old.call(this);
	}
	x.math.renderMath = other;
	x.controller.dispose();
	assert.equal(x.math.renderMath, other);
	x.math.renderMath();
	assert.equal(x.math._mathRenderElt.textContent, "native:" + source);
	x.finish();
	await pause();
	x.dom.window.close();
});
