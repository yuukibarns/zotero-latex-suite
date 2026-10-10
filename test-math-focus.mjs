import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { installMathFocus } from "./build/test-exports.mjs";
for (const tag of ["math-inline", "math-display"]) {
	const dom = new JSDOM(`<div id="outer"><${tag} class="math-node"><div tabindex="0"></div></${tag}></div>`);
	const doc = dom.window.document,
		node = doc.querySelector(".math-node");
	let native = 0,
		inner = 0;
	const original = function () {
		native++;
		return this;
	};
	const outer = { dom: doc.getElementById("outer"), focus: original, state: { selection: { node: {}, from: 5 } } };
	const math = {
		dom: node,
		_isEditing: true,
		_getPos: () => 5,
		_mathSrcElt: node,
		_outerView: outer,
		_node: outer.state.selection.node,
		_innerView: {
			dom: node.firstChild,
			focus() {
				inner++;
			},
			state: { selection: { anchor: 2, head: 4 } },
		},
	};
	node.pmViewDesc = { spec: math };
	const stop = installMathFocus(dom.window);
	outer.focus();
	assert.equal(inner, 1);
	assert.equal(native, 0);
	assert.deepEqual(math._innerView.state.selection, { anchor: 2, head: 4 });
	outer.state.selection.node = null;
	outer.focus();
	assert.equal(native, 1, "Ordinary note focus unchanged");
	outer.state.selection.node = math._node;
	math._innerView.isDestroyed = true;
	outer.focus();
	assert.equal(native, 2);
	const other = {};
	assert.equal(outer.focus.call(other), other, "Foreign receiver delegates");
	stop();
	assert.equal(outer.focus, original);
	math._innerView.isDestroyed = false;
	const stop2 = installMathFocus(dom.window),
		wrapped = outer.focus,
		later = function () {
			return wrapped.call(this);
		};
	outer.focus = later;
	stop2();
	assert.equal(outer.focus, later, "Preserve later wrappers");
	const before = inner;
	outer.focus();
	assert.equal(inner, before, "Retained wrapper is inert after teardown");
	outer.focus = original;
	const stop3 = installMathFocus(dom.window);
	for (const change of [
		() => {
			math._getPos = () => 9;
			return () => (math._getPos = () => 5);
		},
		() => {
			outer.editable = false;
			return () => (outer.editable = true);
		},
		() => {
			math._isEditing = false;
			return () => (math._isEditing = true);
		},
		() => {
			math._innerView.dom.remove();
			return () => node.append(math._innerView.dom);
		},
	]) {
		const undo = change(),
			count = inner;
		outer.focus();
		assert.equal(inner, count, "Stale/mismatched editor delegates");
		undo();
	}
	// A focus handler calling the outer focus must not recurse indefinitely.
	math._innerView.focus = () => {
		inner++;
		outer.focus();
	};
	const n = native;
	outer.focus();
	assert.equal(native, n + 1);
	math._innerView.focus = () => inner++;
	for (let i = 0; i < 3; i++) outer.focus();
	assert.deepEqual(math._innerView.state.selection, { anchor: 2, head: 4 });
	outer.dom.remove();
	await Promise.resolve();
	assert.equal(outer.focus, original, "Detached editor restores hook");
	stop3();
	dom.window.close();
}
console.log("Inline/display math focus routing, selection retention, guards and cleanup passed.");
