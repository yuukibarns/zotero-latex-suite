import { PMBuffer, rememberSelectionClass } from "../editor/pm";
import { previewMarkerSource, renderPreviewMarker } from "./preview_marker";

type Glyph = { text: string; rect: Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">; element: Element };
function glyphs(root: Element): Glyph[] {
	const doc = root.ownerDocument, walker = doc.createTreeWalker(root, 4), result: Glyph[] = [];
	let node: Node | null;
	while ((node = walker.nextNode())) {
		let offset = 0;
		for (const text of node.textContent || "") {
			const range = doc.createRange();
			range.setStart(node, offset); offset += text.length; range.setEnd(node, offset);
			const r = range.getBoundingClientRect(), element = node.parentElement!;
			// Gecko's text ranges can include a displaced line box in KaTeX
			// vlists. The leaf element supplies the actual vertical geometry.
			const b = element.getBoundingClientRect();
			const rect = { left: r.left, right: r.right, width: r.width, top: b.height ? b.top : r.top, bottom: b.height ? b.bottom : r.bottom, height: b.height || r.height };
			if (rect.width && rect.height && !/^[\s\u200b]$/.test(text)) result.push({ text, rect, element: node.parentElement! });
		}
	}
	return result;
}

/** Safe marker locations, deduplicated after command/metadata snapping. */
export function mathCaretPositions(source: string): number[] {
	if (source.length > 2048 || source.includes("▶") || source.includes("\\blacktriangleright")) return [];
	const seen = new Set<string>(), positions: number[] = [];
	for (let head = 0; head <= source.length; head++) {
		if (/[\uDC00-\uDFFF]/.test(source[head] || "")) continue;
		const decorated = previewMarkerSource(source, head);
		if (!seen.has(decorated)) { seen.add(decorated); positions.push(decorated.indexOf("\\text{$\\blacktriangleright$}")); }
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
	let generation = 0, frame = 0, probe: HTMLElement | null = null, stopped = false;
	let pending: (() => void) | null = null, openingTimer = 0;
	let pendingNode: HTMLElement | null = null, pendingX = 0, pendingY = 0;
	function cancel() { generation++; win.cancelAnimationFrame(frame); win.clearTimeout(openingTimer); pending = null; pendingNode = null; frame = 0; probe?.remove(); probe = null; }
	function down(event: MouseEvent) {
		cancel();
		if (stopped || event.defaultPrevented || event.button !== 0 || event.detail > 1 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
		const target = event.target as Element, node = target?.closest?.(".math-node") as HTMLElement | null;
		const math = (node as any)?.pmViewDesc?.spec, render = math?._mathRenderElt as HTMLElement | undefined;
		if (!node || math?._innerView || !render?.contains(target) || typeof math.renderMath !== "function") return;
		const source = math._node?.textContent ?? math._node?.content?.firstChild?.textContent;
		if (typeof source !== "string") return;
		const positions = mathCaretPositions(source), html = render.querySelector(".katex-html");
		if (!positions.length || !html) return;
		const original = glyphs(html);
		if (!original.length) return;
		const distance = (g: Glyph) => Math.hypot(event.clientX - Math.max(g.rect.left, Math.min(g.rect.right, event.clientX)), event.clientY - Math.max(g.rect.top, Math.min(g.rect.bottom, event.clientY)));
		// Italic overhangs and script line boxes can overlap. Prefer the leaf
		// Firefox actually hit rather than letting an overlapping base win.
		const hit = original.map((g, i) => ({ g, i })).filter(({ g }) => g.element === target || g.element.contains(target));
		const candidates = hit.length ? hit : original.map((g, i) => ({ g, i }));
		let anchor = candidates[0].i;
		for (const { g, i } of candidates) if (distance(g) < distance(original[anchor])) anchor = i;
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
			if (!node!.isConnected || !view || view.isDestroyed || view.editable === false || view.state.doc.textContent !== source) { cancel(); return; }
			selection ??= view.state.selection;
			if (!view.state.selection.empty || view.state.selection.anchor !== selection.anchor || view.state.selection.head !== selection.head) { cancel(); return; }
			const start = win.performance.now();
			for (let batch = 0; batch < 8 && index < positions.length && (batch === 0 || win.performance.now() - start < 8); batch++, index++) {
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
			elapsed += win.performance.now() - start;
			if (index < positions.length) {
				if (elapsed > 120) { cancel(); return; }
				frame = win.requestAnimationFrame(step); return;
			}
			if (best !== null && score < Math.max(24, original[anchor].rect.height * 2)) {
				rememberSelectionClass(view);
				PMBuffer.forMath(view, node!.tagName.toLowerCase() === "math-inline" ? "math_inline" : "math_display").setSelection(best, best);
				view.focus();
			}
			cancel();
		}
		pending = step; pendingNode = node; pendingX = event.clientX; pendingY = event.clientY; openingTimer = win.setTimeout(cancel, 500);
	}
	function click(event: MouseEvent) {
		if (!pending) return;
		if (event.button !== 0 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || !pendingNode?.contains(event.target as Node) || Math.abs(event.clientX - pendingX) > 5 || Math.abs(event.clientY - pendingY) > 5) { cancel(); return; }
		win.clearTimeout(openingTimer);
		const step = pending; pending = null;
		frame = win.requestAnimationFrame(step);
	}
	function move(event: MouseEvent) { if (event.buttons & 1) cancel(); }
	doc.addEventListener("mousedown", down, true);
	doc.addEventListener("click", click, true);
	doc.addEventListener("mousemove", move, true);
	doc.addEventListener("keydown", cancel, true);
	doc.addEventListener("beforeinput", cancel, true);
	win.addEventListener("blur", cancel);
	return () => {
		stopped = true; cancel();
		doc.removeEventListener("mousedown", down, true); doc.removeEventListener("click", click, true); doc.removeEventListener("mousemove", move, true);
		doc.removeEventListener("keydown", cancel, true); doc.removeEventListener("beforeinput", cancel, true);
		win.removeEventListener("blur", cancel);
	};
}
