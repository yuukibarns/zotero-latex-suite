import { PMBuffer, rememberSelectionClass } from "../editor/pm";
import { previewMarkerSource, renderPreviewMarker } from "./preview_marker";
import { latexTokens } from "../highlight/tokenizer";

type Glyph = { text: string; rect: Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">; element: Element };
function glyphs(root: Element): Glyph[] {
	const doc = root.ownerDocument, walker = doc.createTreeWalker(root, 4), result: Glyph[] = [];
	let node: Node | null;
	while ((node = walker.nextNode())) {
		const textNode = node, element = node.parentElement!;
		let offset = 0;
		for (const text of node.textContent || "") {
			const from = offset; offset += text.length; const to = offset;
			if (/^[\s\u200b]$/.test(text)) continue;
			let rect: Glyph["rect"] | undefined;
			// A probe needs geometry for only the marker and clicked glyph.
			// Reading every glyph's layout on every candidate dominated the search.
			result.push({ text, element, get rect() {
				if (!rect) {
					const range = doc.createRange(); range.setStart(textNode, from); range.setEnd(textNode, to);
					const r = range.getBoundingClientRect(), b = element.getBoundingClientRect();
					// The leaf box avoids Gecko's displaced KaTeX vlist line boxes.
					rect = { left: r.left, right: r.right, width: r.width, top: b.height ? b.top : r.top, bottom: b.height ? b.bottom : r.bottom, height: b.height || r.height };
				}
				return rect;
			} });
		}
	}
	return result;
}

/** Safe marker locations, deduplicated after command/metadata snapping. */
export function mathCaretPositions(source: string, glyph?: string): number[] {
	if (source.length > 2048 || source.includes("▶") || source.includes("\\blacktriangleright")) return [];
	const seen = new Set<string>(), positions: number[] = [];
	function add(head: number) {
		const decorated = previewMarkerSource(source, head);
		if (!seen.has(decorated)) { seen.add(decorated); positions.push(decorated.indexOf("\\text{$\\blacktriangleright$}")); }
	}
	if (glyph) {
		const tokens = latexTokens(source), hidden = tokens.filter(t => ["command", "environment", "comment", "parameter", "escape"].includes(t.kind));
		let index = 0;
		for (const char of source) {
			if (char === glyph && !hidden.some(t => index >= t.from && index < t.to)) { add(index); add(index + char.length); }
			index += char.length;
		}
		// Literal glyphs (including font arguments, scripts and matrix cells)
		// need just their two boundaries, not a render at every source offset.
		if (positions.length) return positions.length <= 256 ? positions : [];
		// Nonliteral glyphs such as alpha/sum/function names come from commands.
		for (const token of tokens) if (token.kind === "command") { add(token.from); add(token.to); }
		return positions.length <= 256 ? positions : [];
	}
	for (let head = 0; head <= source.length; head++) {
		if (/[\uDC00-\uDFFF]/.test(source[head] || "")) continue;
		add(head);
		if (positions.length > 256) return [];
	}
	return positions;
}

/** Click-only inverse of our preview marker. Native opening is never cancelled.
 * Probe glyphs are aligned to the clicked original glyph, not the box edges:
 * this cancels centering and matrix/fraction layout shifts caused by the marker.
 */
export function installMathCaret(win: Window): () => void {
	const doc = win.document;
	// Temporary diagnostic: bounded metadata only, never source/DOM text.
	const diagnostic = { build: "0.5.3.88", events: [] as Record<string, unknown>[] };
	(win as any).__latexSuiteMathCaretDiagnostic = diagnostic;
	// Some Zotero resource:// editor windows lack the Performance Web API.
	// Millisecond Date timing is sufficient for our bounded probe batches.
	let started = Date.now();
	function trace(stage: string, data: Record<string, unknown> = {}) {
		diagnostic.events.push({ stage, ms: Date.now() - started, ...data });
		if (diagnostic.events.length > 40) diagnostic.events.shift();
	}
	let generation = 0, frame = 0, probe: HTMLElement | null = null, stopped = false;
	let pending: (() => void) | null = null, openingTimer = 0;
	let restoreOpen: (() => void) | null = null;
	let pendingNode: HTMLElement | null = null, pendingX = 0, pendingY = 0;
	function cancel(reason: string | Event = "replaced") { if (pendingNode) trace("cancel", { reason: typeof reason === "string" ? reason : reason.type }); generation++; win.cancelAnimationFrame(frame); win.clearTimeout(openingTimer); restoreOpen?.(); pending = null; pendingNode = null; frame = 0; probe?.remove(); probe = null; }
	function down(event: MouseEvent) {
		cancel();
		started = Date.now(); diagnostic.events.length = 0;
		trace("mousedown", { detail: event.detail, button: event.button, prevented: event.defaultPrevented });
		if (stopped || event.defaultPrevented || event.button !== 0 || event.detail > 1 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
		const target = event.target as Element, node = target?.closest?.(".math-node") as HTMLElement | null;
		const math = (node as any)?.pmViewDesc?.spec, render = math?._mathRenderElt as HTMLElement | undefined;
		if (!node || math?._innerView || !render?.contains(target) || typeof math.renderMath !== "function" || typeof math.openEditor !== "function") { trace("not-closed-render", { node: !!node, math: !!math, inner: !!math?._innerView, inRender: !!render?.contains(target) }); return; }
		const source = math._node?.textContent ?? math._node?.content?.firstChild?.textContent;
		if (typeof source !== "string") return;
		const html = render.querySelector(".katex-html");
		if (!html) return;
		const original = glyphs(html);
		if (!original.length) return;
		const distance = (g: Glyph) => Math.hypot(event.clientX - Math.max(g.rect.left, Math.min(g.rect.right, event.clientX)), event.clientY - Math.max(g.rect.top, Math.min(g.rect.bottom, event.clientY)));
		// Italic overhangs and script line boxes can overlap. Prefer the leaf
		// Firefox actually hit rather than letting an overlapping base win.
		const hit = original.map((g, i) => ({ g, i })).filter(({ g }) => g.element === target || g.element.contains(target));
		const candidates = (hit.length ? hit : original.map((g, i) => ({ g, i }))).filter(({ g }) => g.rect.width && g.rect.height);
		if (!candidates.length) return;
		let anchor = candidates[0].i;
		for (const { g, i } of candidates) if (distance(g) < distance(original[anchor])) anchor = i;
		const positions = mathCaretPositions(source, original[anchor].text);
		trace("candidates", { sourceLength: source.length, glyphCount: original.length, positions: positions.length });
		if (!positions.length) return;
		const signature = original.map(g => g.text).join(""), id = generation;
		const box = render.getBoundingClientRect(), font = win.getComputedStyle(render);
		probe = node.cloneNode(false) as HTMLElement;
		probe.removeAttribute("id"); probe.classList.remove("ProseMirror-selectednode", "math-select");
		probe.setAttribute("aria-hidden", "true"); probe.setAttribute("contenteditable", "false");
		Object.assign(probe.style, { position: "fixed", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, visibility: "hidden", pointerEvents: "none", font: font.font });
		// Never insert a probe into ProseMirror's observed, editable DOM.
		const output = doc.createElement("div"); output.className = "math-render"; probe.append(output); doc.body.append(probe);
		let index = 0, best: number | null = null, score = Infinity, elapsed = 0;
		let selection: any = null;
		function step() {
			frame = 0;
			if (id !== generation || stopped) return;
			const view = math._innerView;
			trace("frame", { inner: !!view, connected: node!.isConnected, head: view?.state?.selection?.head });
			if (!node!.isConnected || !view || view.isDestroyed || view.editable === false || view.state.doc.textContent !== source) { cancel("editor-not-ready"); return; }
			selection ??= view.state.selection;
			if (!view.state.selection.empty || view.state.selection.anchor !== selection.anchor || view.state.selection.head !== selection.head) { cancel("selection-changed"); return; }
			const start = Date.now();
			for (let batch = 0; batch < 8 && index < positions.length && (batch === 0 || Date.now() - start < 8); batch++, index++) {
				const head = positions[index];
				if (!renderPreviewMarker(math, output, source, head)) continue;
				const rendered = output.querySelector(".katex-html");
				if (!rendered) continue;
				const all = glyphs(rendered), markers = all.filter(g => g.text === "▶"), rest = all.filter(g => g.text !== "▶");
				if (markers.length !== 1 || rest.map(g => g.text).join("") !== signature) continue;
				// A fraction argument, script, or matrix cell has its own vlist
				// row. Keep clicks inside that row despite the triangle's metrics.
				const scope = rest[anchor].element.closest(".vlist > span") ?? rest[anchor].element.closest(".sizing");
				if (scope && !scope.contains(markers[0].element)) continue;
				const a = rest[anchor].rect, m = markers[0].rect, o = original[anchor].rect;
				// The text-mode triangle has larger metrics than a script glyph.
				// Compare their lower edges (baseline proxy), not their centers.
				// Before the anchor, the marker's right edge is the insertion
				// boundary; after it, use the left edge. Its width isn't a caret.
				const edge = all.indexOf(markers[0]) <= anchor ? m.right : m.left;
				const x = o.left + edge - a.left, y = (o.top + o.bottom) / 2 + (scope ? 0 : m.bottom - a.bottom);
				const d = Math.hypot(x - event.clientX, 2 * (y - event.clientY));
				if (d < score) { score = d; best = head; }
			}
			elapsed += Date.now() - start;
			if (index < positions.length) {
				// Yield between bounded batches, but retain progress on slower
				// equations/devices. A CPU deadline must not discard a valid click.
				frame = win.requestAnimationFrame(step); return;
			}
			if (best !== null && score < Math.max(24, original[anchor].rect.height * 2)) {
				rememberSelectionClass(view);
				PMBuffer.forMath(view, node!.tagName.toLowerCase() === "math-inline" ? "math_inline" : "math_display").setSelection(best, best);
				view.focus();
			}
			trace("result", { best, score: Number.isFinite(score) ? Math.round(score) : null, head: view.state.selection.head, probeMs: Math.round(elapsed) });
			cancel("finished");
		}
		// Opening can follow DOM-selection reconciliation, not this mouseup.
		// Observe this node's actual native opening, after its start/end choice.
		// The one-shot hook never opens a node itself and restores the method.
		let released = false, opened = false, scheduled = false;
		function scheduleAfterOpen() {
			if (id !== generation || !released || !opened || scheduled) return;
			scheduled = true; pending = null; win.clearTimeout(openingTimer);
			frame = win.requestAnimationFrame(step);
		}
		const originalOpen = math.openEditor, ownOpen = Object.getOwnPropertyDescriptor(math, "openEditor");
		function restore() {
			if (math.openEditor === hookedOpen) {
				if (ownOpen) Object.defineProperty(math, "openEditor", ownOpen);
				else delete math.openEditor;
			}
			if (restoreOpen === restore) restoreOpen = null;
		}
		function hookedOpen(this: any, ...args: any[]) {
			restore(); trace("native-open-start");
			let result;
			try { result = originalOpen.apply(this, args); }
			catch (error) { cancel("native-open-error"); throw error; }
			trace("native-open-end", { inner: !!math._innerView, head: math._innerView?.state?.selection?.head });
			opened = true; scheduleAfterOpen();
			return result;
		}
		math.openEditor = hookedOpen; restoreOpen = restore;
		pending = () => { released = true; scheduleAfterOpen(); };
		pendingNode = node; pendingX = event.clientX; pendingY = event.clientY;
		openingTimer = win.setTimeout(() => cancel("release-timeout"), 2000);
		trace("waiting-mouseup");
	}
	function release(event: MouseEvent) {
		trace("mouseup", { pending: !!pending, inner: !!(pendingNode as any)?.pmViewDesc?.spec?._innerView });
		if (!pending) return;
		if (event.button !== 0 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || !pendingNode?.contains(event.target as Node) || Math.abs(event.clientX - pendingX) > 5 || Math.abs(event.clientY - pendingY) > 5) { cancel(); return; }
		win.clearTimeout(openingTimer);
		// This is only a stale-gesture cleanup bound, not an opening delay.
		openingTimer = win.setTimeout(() => cancel("opening-timeout"), 2000);
		pending();
	}
	// Match ProseMirror MouseDown.updateAllowDefault's four-pixel threshold.
	function move(event: MouseEvent) {
		if (event.buttons & 1 && pendingNode && (Math.abs(event.clientX - pendingX) > 4 || Math.abs(event.clientY - pendingY) > 4)) cancel();
	}
	function click() { trace("click", { inner: !!(pendingNode as any)?.pmViewDesc?.spec?._innerView }); }
	function error(event: ErrorEvent) { trace("error", { name: event.error?.name || "Error" }); }
	doc.addEventListener("mousedown", down, true);
	// Mouseup qualifies the click; MathView.openEditor qualifies readiness.
	doc.addEventListener("mouseup", release, true);
	doc.addEventListener("click", click, true);
	win.addEventListener("error", error);
	doc.addEventListener("mousemove", move, true);
	doc.addEventListener("keydown", cancel, true);
	doc.addEventListener("beforeinput", cancel, true);
	win.addEventListener("blur", cancel);
	return () => {
		stopped = true; cancel();
		doc.removeEventListener("mousedown", down, true); doc.removeEventListener("mouseup", release, true); doc.removeEventListener("mousemove", move, true);
		doc.removeEventListener("keydown", cancel, true); doc.removeEventListener("beforeinput", cancel, true);
		win.removeEventListener("blur", cancel);
		doc.removeEventListener("click", click, true); win.removeEventListener("error", error);
		delete (win as any).__latexSuiteMathCaretDiagnostic;
	};
}
