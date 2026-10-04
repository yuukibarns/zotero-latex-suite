import { PMBuffer, rememberSelectionClass } from "../editor/pm";
import { sourceGlyphs } from "../../build/katex-source-map.mjs";

type SourceGlyph = { text: string; from: number | null; to: number | null };
type Glyph = { text: string; node: Text; offset: number; element: Element };

function glyphs(root: Element): Glyph[] {
	const walker = root.ownerDocument.createTreeWalker(root, 4), result: Glyph[] = [];
	let node: Node | null;
	while ((node = walker.nextNode())) {
		if (node.parentElement?.closest(".ls-preview-caret")) continue;
		let offset = 0;
		for (const text of node.textContent || "") {
			if (!/^[\s\u200b]$/.test(text)) result.push({ text, node: node as Text, offset, element: node.parentElement! });
			offset += text.length;
		}
	}
	return result;
}

/** A render owns its map. Source changes or native rerenders invalidate it. */
export function createMathSourceMap() {
	const cache = new WeakMap<Element, { source: string; map: SourceGlyph[] }>();
	return (html: Element, source: string, options: any): SourceGlyph[] | null => {
		let entry = cache.get(html);
		if (!entry || entry.source !== source) {
			try { entry = { source, map: sourceGlyphs(source, options) }; }
			catch { return null; }
			cache.set(html, entry);
		}
		const native = glyphs(html);
		// Renderer-version/options differences must not silently misalign offsets.
		return native.length === entry.map.length && native.every((g, i) => g.text === entry!.map[i].text) ? entry.map : null;
	};
}

/** Locate a source boundary from actual native glyph geometry, never a probe. */
export function mathSelectionRects(html: Element, map: SourceGlyph[], from: number, to: number): DOMRect[] {
	const result: DOMRect[] = [];
	for (const [i, g] of glyphs(html).entries()) {
		const m = map[i];
		if (m?.from == null || m.to == null || m.from >= to || m.to <= from) continue;
		const range = html.ownerDocument.createRange();
		range.setStart(g.node, g.offset); range.setEnd(g.node, g.offset + g.text.length);
		const rect = range.getBoundingClientRect(), leaf = g.element.getBoundingClientRect();
		if (rect.width && leaf.height) result.push({ left: rect.left, top: leaf.top, width: rect.width, height: leaf.height } as DOMRect);
	}
	return result;
}

export function mathCaretAt(html: Element, map: SourceGlyph[], target: Element, x: number, y: number): number | null {
	// A radical's SVG box can overlay its argument. Permit a glyph directly
	// under that box, but do not guess a nearby letter when clicking the stroke.
	const shape = !!target.closest("svg, .frac-line");
	const native = glyphs(html);
	const hit = native.map((g, i) => ({ g, i })).filter(({ g }) => g.element === target || g.element.contains(target));
	let best: { i: number; rect: DOMRect; distance: number } | null = null;
	for (const { g, i } of hit.length ? hit : native.map((g, i) => ({ g, i }))) {
		const range = html.ownerDocument.createRange();
		range.setStart(g.node, g.offset); range.setEnd(g.node, g.offset + g.text.length);
		const r = range.getBoundingClientRect(), leaf = g.element.getBoundingClientRect();
		if (!r.width || !leaf.height) continue;
		// Gecko's Range may include a displaced KaTeX vlist line box.
		const distance = Math.hypot(x - Math.max(r.left, Math.min(r.right, x)), y - Math.max(leaf.top, Math.min(leaf.bottom, y)));
		if (!best || distance < best.distance) best = { i, rect: r, distance };
	}
	if (!best || best.distance > (shape ? 0 : 24)) return null;
	const mapped = map[best.i];
	if (mapped?.from == null || mapped.to == null) return null;
	return x < (best.rect.left + best.rect.right) / 2 ? mapped.from : mapped.to;
}

/** One synchronous, one-shot native-opening hook. No delayed caret correction. */
export function installMathCaret(win: Window): () => void {
	const doc = win.document, getMap = createMathSourceMap();
	const diagnostic = { build: "0.5.3.97", events: [] as Record<string, unknown>[] };
	(win as any).__latexSuiteMathCaretDiagnostic = diagnostic;
	let started = 0, timer = 0, restoreOpen: (() => void) | null = null;
	let pendingNode: HTMLElement | null = null, pendingX = 0, pendingY = 0;
	function trace(stage: string, data: Record<string, unknown> = {}) {
		diagnostic.events.push({ stage, ms: Date.now() - started, ...data });
		if (diagnostic.events.length > 30) diagnostic.events.shift();
	}
	function cancel(reason: string | Event = "replaced") {
		if (pendingNode && reason !== "opening") trace("cancel", {
			reason: typeof reason === "string" ? reason : reason.type,
			connected: pendingNode.isConnected,
			inner: !!(pendingNode as any).pmViewDesc?.spec?._innerView,
			documentFocused: doc.hasFocus(),
		});
		win.clearTimeout(timer); restoreOpen?.(); pendingNode = null;
	}
	function down(event: MouseEvent) {
		cancel(); started = Date.now(); diagnostic.events.length = 0;
		trace("mousedown", { detail: event.detail, button: event.button, prevented: event.defaultPrevented });
		if (event.defaultPrevented || event.button !== 0 || event.detail > 1 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
		const target = event.target as Element, node = target?.closest?.(".math-node") as HTMLElement | null;
		const math = (node as any)?.pmViewDesc?.spec, render = math?._mathRenderElt as HTMLElement | undefined;
		if (!node || math?._innerView || !render?.contains(target) || typeof math.openEditor !== "function") return;
		const html = render.querySelector(".katex-html"), source = math._node?.textContent;
		if (!html || typeof source !== "string") return;
		const map = getMap(html, source, math._katexOptions);
		const head = map ? mathCaretAt(html, map, target, event.clientX, event.clientY) : null;
		trace("mapped", { sourceLength: source.length, glyphCount: map?.length ?? 0, head });
		if (head == null) return;
		const originalOpen = math.openEditor, ownOpen = Object.getOwnPropertyDescriptor(math, "openEditor");
		function restore() {
			if (math.openEditor === hookedOpen) {
				if (ownOpen) Object.defineProperty(math, "openEditor", ownOpen);
				else delete math.openEditor;
			}
			if (restoreOpen === restore) restoreOpen = null;
		}
		function hookedOpen(this: any, ...args: any[]) {
			trace("native-open-start"); cancel("opening");
			// Native creates/focuses the inner view and chooses start/end. Set the
			// mapped position in this SAME call stack, before the browser can paint.
			let result;
			try { result = originalOpen.apply(this, args); }
			catch (error) { trace("native-open-error"); throw error; }
			const view = math._innerView;
			trace("native-open-end", { connected: node!.isConnected, inner: !!view, destroyed: !!view?.isDestroyed, editable: view?.editable !== false, sameSource: view?.state?.doc?.textContent === source, empty: view?.state?.selection?.empty, head: view?.state?.selection?.head });
			if (node!.isConnected && view && !view.isDestroyed && view.editable !== false && view.state.doc.textContent === source && view.state.selection.empty) {
				rememberSelectionClass(view);
				PMBuffer.forMath(view, node!.tagName.toLowerCase() === "math-inline" ? "math_inline" : "math_display").setSelection(head!, head!);
				trace("placed-before-paint", { head: view.state.selection.head });
			}
			return result;
		}
		math.openEditor = hookedOpen; restoreOpen = restore;
		pendingNode = node; pendingX = event.clientX; pendingY = event.clientY;
		timer = win.setTimeout(() => cancel("opening-timeout"), 2000);
	}
	function move(event: MouseEvent) {
		if (event.buttons & 1 && pendingNode && (Math.abs(event.clientX - pendingX) > 4 || Math.abs(event.clientY - pendingY) > 4)) {
			trace("movement", { dx: Math.round(event.clientX - pendingX), dy: Math.round(event.clientY - pendingY) }); cancel("drag-threshold");
		}
	}
	function release(event: MouseEvent) {
		if (!pendingNode) return;
		trace("mouseup", { inside: pendingNode.contains(event.target as Node), dx: Math.round(event.clientX - pendingX), dy: Math.round(event.clientY - pendingY) });
		// Gecko can retarget mouseup to an ancestor at unchanged coordinates.
		// PM retains the mousedown position and can still open this math node.
		// Qualify the gesture by movement/buttons, not the release DOM target;
		// placement still requires this exact node's native openEditor call.
		if (event.button !== 0 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || Math.abs(event.clientX - pendingX) > 5 || Math.abs(event.clientY - pendingY) > 5) cancel("release-rejected");
	}
	doc.addEventListener("mousedown", down, true);
	doc.addEventListener("mousemove", move, true);
	doc.addEventListener("mouseup", release, true);
	doc.addEventListener("keydown", cancel, true);
	doc.addEventListener("beforeinput", cancel, true);
	win.addEventListener("blur", cancel);
	return () => {
		cancel();
		doc.removeEventListener("mousedown", down, true);
		doc.removeEventListener("mousemove", move, true);
		doc.removeEventListener("mouseup", release, true);
		doc.removeEventListener("keydown", cancel, true);
		doc.removeEventListener("beforeinput", cancel, true);
		win.removeEventListener("blur", cancel);
		delete (win as any).__latexSuiteMathCaretDiagnostic;
	};
}
