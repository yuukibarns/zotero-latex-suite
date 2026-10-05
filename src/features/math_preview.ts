import { previewMarkerColor, renderPreviewMarker } from "./preview_marker";
import { createMathSourceMap, mathCaretAt, mathSelectionRects } from "./math_caret";
import { PMBuffer, rememberSelectionClass } from "../editor/pm";
import { createMathDragSelection, createMathSelection, mathWordRange, normalizeMathClickTimeout } from "./math_selection";

/** View-only previews using the renderer already owned by Zotero's MathView. */
export function installMathPreview(win: Window, debounceMs = 100, inlineEnabled = true, displayEnabled = true, marker: { color?: unknown; blink?: boolean; clickTimeout?: number } = {}) {
	const delay = Number.isFinite(debounceMs) ? Math.max(0, Math.min(2000, debounceMs)) : 100;
	const doc = win.document;
	const panel = doc.createElement("div");
	panel.id = "latex-suite-math-preview";
	panel.contentEditable = "false";
	panel.setAttribute("role", "region");
	panel.setAttribute("aria-label", "Equation preview");
	panel.style.setProperty("--ls-preview-caret-color", previewMarkerColor(marker.color));
	const output = doc.createElement("div"), status = doc.createElement("div");
	output.style.position = "relative";
	const selectionLayer = doc.createElement("div");
	selectionLayer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:visible";
	selectionLayer.setAttribute("aria-hidden", "true");
	selectionLayer.className = "ls-preview-selection";
	status.className = "ls-preview-status";
	panel.append(output, status);
	const style = doc.createElement("style");
	style.textContent = `#latex-suite-math-preview{box-sizing:border-box;padding:10px;background:Canvas;color:CanvasText;color-scheme:light dark;border:1px solid GrayText;border-radius:5px;overflow:auto;font:initial;pointer-events:auto}#latex-suite-math-preview[data-inline=true]{position:fixed;z-index:2147483646;max-height:35vh;overscroll-behavior:contain;max-width:calc(100vw - 16px);box-shadow:0 3px 12px #0003}#latex-suite-math-preview[data-inline=false]{display:block;margin-top:8px;width:max-content;min-width:100%;max-width:none;max-height:none;overflow:visible}#latex-suite-math-preview .ls-preview-status{font:11px sans-serif;color:GrayText;margin-top:4px}#latex-suite-math-preview .ls-preview-status:empty{display:none}#latex-suite-math-preview .katex-display{margin:0}`;
	style.textContent += `
#latex-suite-math-preview .ls-preview-caret{color:var(--ls-preview-caret-color)!important;opacity:1;pointer-events:none}
#latex-suite-math-preview .ls-preview-caret .rule{border-right-width:max(1.5px,0.065em)!important}
#latex-suite-math-preview[data-marker-idle=true] .ls-preview-caret{animation:ls-preview-caret-blink 1s step-end infinite}
@keyframes ls-preview-caret-blink{0%,49%{opacity:1}50%,100%{opacity:0}}
@media(prefers-reduced-motion:reduce){#latex-suite-math-preview .ls-preview-caret{animation:none!important;opacity:1!important}}
@media(forced-colors:active){#latex-suite-math-preview .ls-preview-caret{color:Highlight!important}}
`;
	doc.head.append(style);
	let frame = 0, stopped = false, composing = false;
	let owner: any = null, lastText: string | null = null;
	let externalPreview = false;
	function releaseExternal() {
		if (!externalPreview) return;
		doc.dispatchEvent(new (win as any).CustomEvent("latex-suite-preview-release", { detail: { math: owner, output } }));
		externalPreview = false;
		delete panel.dataset.externalRenderer;
	}
	let lastHead: number | null | undefined;
	let ownerNode: HTMLElement | null = null, interacting = false;
	const getMap = createMathSourceMap();
	const expandSelection = createMathSelection();
	const dragBoundaries = createMathDragSelection();
	let clicks: { owner: any; source: string; x: number; y: number; time: number; count: number; anchor: number; from: number; to: number } | null = null;
	let drag: { source: string; owner: any; anchor: number; x: number; y: number; moved: boolean } | null = null;
	function paintSelection() {
		selectionLayer.replaceChildren();
		const view = owner?._innerView, sel = view?.state.selection, html = output.querySelector(".katex-html");
		if (!html || !sel || sel.empty || status.textContent || view.state.doc.textContent !== lastText) return;
		const map = getMap(html, lastText!, owner._katexOptions);
		if (!map) return;
		const origin = output.getBoundingClientRect();
		for (const r of mathSelectionRects(html, map, sel.from, sel.to)) {
			const box = doc.createElement("span");
			box.style.cssText = `position:absolute;left:${r.left-origin.left}px;top:${r.top-origin.top}px;width:${r.width}px;height:${r.height}px;background:var(--ls-preview-caret-color);opacity:.28;pointer-events:none`;
			selectionLayer.append(box);
		}
		output.append(selectionLayer);
	}
	function dragSelection(e: MouseEvent) {
		if (externalPreview || !drag || !(e.buttons & 1)) return;
		if (Math.abs(e.clientX-drag.x)>5 || Math.abs(e.clientY-drag.y)>5) drag.moved = true;
		if (!drag.moved) return;
		clicks = null;
		press = null;
		const view = owner?._innerView, target = e.target as Element, html = target.closest?.(".katex-html");
		if (composing || drag.owner !== owner || !ownerNode?.isConnected || !view || view.isDestroyed || view.editable === false || view.state.doc.textContent !== drag.source || status.textContent) { drag = null; return; }
		if (!html || !output.contains(html)) return;
		const map = getMap(html, drag.source, owner._katexOptions);
		const head = map ? mathCaretAt(html, map, target, e.clientX, e.clientY) : null;
		if (head === null) return;
		const selected = dragBoundaries(drag.source, drag.anchor, head);
		if (view.state.selection.anchor === selected.anchor && view.state.selection.head === selected.head) return;
		rememberSelectionClass(view);
		PMBuffer.forMath(view, ownerNode.localName === "math-inline" ? "math_inline" : "math_display").setSelection(selected.anchor, selected.head);
		e.preventDefault(); schedule();
	}
	let press: { x: number; y: number; owner: any; source: string } | null = null;
	function placeCaret(e: MouseEvent) {
		if (externalPreview) return;
		// Use the decorated preview's geometry but the unmodified source map.
		// Never map a retained/debounced preview into a newer source document.
		const gesture = press; press = null;
		const view = owner?._innerView, target = e.target as Element;
		if (!gesture || gesture.owner !== owner || composing || e.button !== 0 || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey
			|| Math.abs(e.clientX - gesture.x) > 5 || Math.abs(e.clientY - gesture.y) > 5
			|| !ownerNode?.isConnected || !view || view.isDestroyed || view.editable === false
			|| status.textContent || lastText !== gesture.source || view.state.doc.textContent !== gesture.source) return;
		const html = target.closest?.(".katex-html");
		if (!html || !output.contains(html)) return;
		// The DOM is replaced when the marker disappears. Continue from the
		// original source anchor, never remap later taps against shifted glyphs.
		const continuing = clicks && clicks.owner === owner && clicks.source === gesture.source
			&& e.timeStamp >= clicks.time && e.timeStamp-clicks.time < normalizeMathClickTimeout(marker.clickTimeout)
			&& Math.abs(e.clientX-clicks.x)<=5 && Math.abs(e.clientY-clicks.y)<=5
			&& view.state.selection.from === clicks.from && view.state.selection.to === clicks.to;
		const map = continuing ? null : getMap(html, gesture.source, owner._katexOptions);
		const head = continuing ? clicks!.anchor : map ? mathCaretAt(html, map, target, e.clientX, e.clientY) : null;
		if (head === null) return;
		rememberSelectionClass(view);
		const buffer = PMBuffer.forMath(view, ownerNode.localName === "math-inline" ? "math_inline" : "math_display");
		const count = continuing ? clicks!.count+1 : 1;
		if (count === 1) buffer.setSelection(head, head);
		else if (count === 2) { const word = mathWordRange(gesture.source, head); buffer.setSelection(word.from, word.to); }
		else expandSelection(buffer, false, false, true);
		clicks = { owner, source: gesture.source, x:e.clientX, y:e.clientY, time:e.timeStamp, count, anchor:head, from:view.state.selection.from, to:view.state.selection.to };
		view.focus(); pauseBlink(); schedule();
	}
	let timer = 0, pendingText: string | null = null, ready = false;
	let blinkTimer = 0, activityText: string | null = null, activityHead: number | null | undefined;
	function pauseBlink() {
		win.clearTimeout(blinkTimer); blinkTimer = 0; panel.dataset.markerIdle = "false";
		if (marker.blink && !composing && owner) blinkTimer = win.setTimeout(() => {
			blinkTimer = 0; panel.dataset.markerIdle = "true";
		}, 600);
	}
	function cancelRender() { win.clearTimeout(timer); timer = 0; pendingText = null; ready = false; }
	function close() { releaseExternal(); clicks = null; drag = null; press = null; selectionLayer.replaceChildren(); cancelRender(); owner = null; pauseBlink(); panel.remove(); panel.style.visibility = ""; output.replaceChildren(); status.textContent = ""; ownerNode = null; interacting = false; lastText = null; lastHead = undefined; activityText = null; activityHead = undefined; }
	function refresh() {
		frame = 0;
		if (stopped || composing) return;
		const node = (interacting && ownerNode?.isConnected ? ownerNode : doc.activeElement?.closest(".math-node")) as HTMLElement | null;
		const math = (node as any)?.pmViewDesc?.spec;
		if (node && !(node.localName === "math-inline" ? inlineEnabled : displayEnabled)) { close(); return; }
		if (!node || !math?._innerView || typeof math.renderMath !== "function" || !math._mathRenderElt) { close(); return; }
		if (owner !== math) { close(); owner = math; ownerNode = node; }
		const text = math._innerView.state.doc.textContent;
		// Optional renderers supply content, not a second preview panel.
		const request = { math, output, debounceMs: delay, handled: false };
		if (node.localName === "math-display") doc.dispatchEvent(new (win as any).CustomEvent("latex-suite-preview-request", { detail: request }));
		if (request.handled) {
			panel.dataset.externalRenderer = "true";
			externalPreview = true; cancelRender(); lastText = text;
			selectionLayer.remove(); status.textContent = "";
			panel.dataset.inline = "false";
			panel.style.removeProperty("left"); panel.style.removeProperty("top");
			if (panel.parentNode !== node) node.append(panel);
			return;
		}
		if (externalPreview) { releaseExternal(); output.replaceChildren(); lastText = null; }
		const selection = math._innerView.state.selection;
		const head = selection?.empty && Number.isFinite(selection.head) ? selection.head : null;
		if (text !== activityText || head !== activityHead) { activityText = text; activityHead = head; pauseBlink(); }
		if (text === lastText) cancelRender();
		else if (text !== pendingText) {
			cancelRender(); pendingText = text;
			if (delay === 0) ready = true;
			else timer = win.setTimeout(() => { timer = 0; ready = true; schedule(); }, delay);
		}
		if (text !== lastText && ready) {
			cancelRender();
			lastText = text;
			lastHead = undefined;
			try {
				math.renderMath();
				if (math._mathRenderElt.classList.contains("parse-error") || math._mathRenderElt.querySelector(".katex-error")) status.textContent = "Incomplete expression — showing last valid preview";
				else {
					output.replaceChildren(...Array.from(math._mathRenderElt.childNodes, (n: any) => n.cloneNode(true)) as Node[]);
					status.textContent = text.trim() ? "" : "Empty expression";
				}
			} catch { status.textContent = "Preview unavailable"; }
			if (!output.childNodes.length && status.textContent?.startsWith("Incomplete")) status.textContent = "Incomplete expression";
		}
		if (text === lastText && !status.textContent && head !== lastHead) {
			lastHead = head;
			// Selection-only updates don't render or modify Zotero's native node.
			// Fall back to the unmarked native rendering for unsupported positions.
			if (head === null || !renderPreviewMarker(math, output, text, head)) {
				output.replaceChildren(...Array.from(math._mathRenderElt.childNodes, (n: any) => n.cloneNode(true)) as Node[]);
			}
		}
		// Retain the last rendering while typing; don't show an empty first panel.
		if (lastText === null) return;
		const inline = node.tagName.toLowerCase() === "math-inline";
		panel.dataset.inline = String(inline);
		const parent = inline ? doc.body : node;
		if (panel.parentNode !== parent) parent.append(panel);
		if (!inline) { panel.style.removeProperty("left"); panel.style.removeProperty("top"); paintSelection(); return; }
		// Inline wrappers can report only their baseline/last line. Include the
		// nested source editor, whose box contains every wrapped source line.
		const boxes = [node.getBoundingClientRect(), math._innerView.dom?.getBoundingClientRect()]
			.filter((r): r is DOMRect => !!r && (r.width > 0 || r.height > 0));
		const anchor = boxes.length ? {
			left: Math.min(...boxes.map(r => r.left)), right: Math.max(...boxes.map(r => r.right)),
			top: Math.min(...boxes.map(r => r.top)), bottom: Math.max(...boxes.map(r => r.bottom)),
		} : node.getBoundingClientRect();
		const width = panel.offsetWidth, height = panel.offsetHeight;
		const left = Math.max(8, Math.min(anchor.left, win.innerWidth - width - 8));
		// Always above the source, independent of completion placement/height.
		// The completion menu has a higher z-index and may overlap the preview.
		const top = anchor.top - height - 6;
		if (top < 8 || top + height > win.innerHeight - 8) { panel.style.visibility = "hidden"; return; }
		panel.style.visibility = "";
		panel.style.left = `${left}px`;
		panel.style.top = `${top}px`;
		paintSelection();
	}
	function schedule() { if (!stopped && !frame) frame = win.requestAnimationFrame(refresh); }
	const activity = () => { clicks = null; drag = null; press = null; pauseBlink(); schedule(); };
	const start = () => { clicks = null; drag = null; press = null; composing = true; pauseBlink(); cancelRender(); };
	const cancelGesture = (e: Event) => { if (e.target !== win) return; clicks = null; drag = null; press = null; interacting = false; schedule(); };
	const end = () => { composing = false; activity(); };
	const viewport = (e: Event) => {
		if ((e.target as Element)?.closest?.("#latex-suite-math-preview, #latex-suite-completion")) return;
		schedule();
	};
	// MathView only stops events from its source editor. Intercept preview
	// pointer/mouse events before they reach ProseMirror or MathView's click
	// handler, while leaving native scrollbar default actions enabled.
	const interaction = (e: Event) => {
		const mouse = e as MouseEvent;
		if (e.type === "pointercancel") { clicks = null; press = null; drag = null; }
		if (e.type === "mousemove") dragSelection(mouse);
		const inside = (e.target as Element)?.closest?.("#latex-suite-math-preview") === panel;
		if (e.type === "mousedown") {
			if (!inside || mouse.button !== 0 || mouse.ctrlKey || mouse.altKey || mouse.metaKey || mouse.shiftKey) clicks = null;
			drag = null;
			press = !externalPreview && inside && mouse.button === 0 && !mouse.ctrlKey && !mouse.altKey && !mouse.metaKey && !mouse.shiftKey && lastText !== null
				&& !!(e.target as Element).closest?.(".katex-html") ? { x: mouse.clientX, y: mouse.clientY, owner, source: lastText } : null;
			if (press && !composing && owner?._innerView?.state.doc.textContent === lastText && !status.textContent) {
				const html = (e.target as Element).closest(".katex-html")!, map = getMap(html, lastText!, owner._katexOptions);
				const anchor = map ? mathCaretAt(html, map, e.target as Element, mouse.clientX, mouse.clientY) : null;
				if (anchor !== null) drag = { ...press, anchor, moved: false };
			}
		}
		if (e.type === "mouseup") { if (drag?.moved) press = null; drag = null; }
		if (e.type === "click") { if (inside) placeCaret(mouse); else press = null; }
		if (inside) {
			e.stopPropagation();
			if (e.type === "pointerdown" || e.type === "mousedown") interacting = true;
			if (e.type === "mousedown" && e.target !== panel) e.preventDefault();
		}
		if (interacting && ["pointerup", "pointercancel", "mouseup", "click"].includes(e.type)) {
			interacting = false;
			if (ownerNode?.isConnected) owner?._innerView?.focus();
			schedule();
		}
	};
	const interactionEvents = ["pointerdown", "mousedown", "mousemove", "pointerup", "pointercancel", "mouseup", "click", "dblclick"];
	interactionEvents.forEach(name => doc.addEventListener(name, interaction, true));
	const wheel = (e: Event) => { e.stopPropagation(); }; // native scrolling stays enabled
	panel.addEventListener("wheel", wheel, { passive: true });
	const listeners: [EventTarget, string, EventListener][] = [
		[win, "blur", cancelGesture],
		[doc, "input", activity], [doc, "keydown", activity], [doc, "selectionchange", schedule],
		[doc, "focusin", schedule], [doc, "focusout", schedule], [doc, "scroll", viewport],
		[win, "resize", viewport], [doc, "compositionstart", start], [doc, "compositionend", end],
	];
	listeners.forEach(([target, name, fn]) => target.addEventListener(name, fn, true));
	// Includes snippet/completion transactions that do not dispatch DOM input.
	const observer = new (win as any).MutationObserver((records: MutationRecord[]) => {
		if (records.some(r => {
			const el = r.target.nodeType === 1 ? r.target as Element : r.target.parentElement;
			return el?.closest(".math-src");
		})) schedule();
	});
	observer.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["style"] });
	schedule();
	return () => {
		stopped = true; win.cancelAnimationFrame(frame); observer.disconnect(); close(); style.remove();
		interactionEvents.forEach(name => doc.removeEventListener(name, interaction, true)); panel.removeEventListener("wheel", wheel);
		listeners.forEach(([target, name, fn]) => target.removeEventListener(name, fn, true));
	};
}
