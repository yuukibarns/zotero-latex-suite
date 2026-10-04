import { previewMarkerColor, renderPreviewMarker } from "./preview_marker";

/** View-only previews using the renderer already owned by Zotero's MathView. */
export function installMathPreview(win: Window, debounceMs = 100, inlineEnabled = true, displayEnabled = true, marker: { color?: unknown; blink?: boolean } = {}) {
	const delay = Number.isFinite(debounceMs) ? Math.max(0, Math.min(2000, debounceMs)) : 100;
	const doc = win.document;
	const panel = doc.createElement("div");
	panel.id = "latex-suite-math-preview";
	panel.contentEditable = "false";
	panel.setAttribute("role", "region");
	panel.setAttribute("aria-label", "Equation preview");
	panel.style.setProperty("--ls-preview-caret-color", previewMarkerColor(marker.color));
	const output = doc.createElement("div"), status = doc.createElement("div");
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
	let lastHead: number | null | undefined;
	let ownerNode: HTMLElement | null = null, interacting = false;
	let timer = 0, pendingText: string | null = null, ready = false;
	let blinkTimer = 0, activityText: string | null = null, activityHead: number | null | undefined;
	function pauseBlink() {
		win.clearTimeout(blinkTimer); blinkTimer = 0; panel.dataset.markerIdle = "false";
		if (marker.blink && !composing && owner) blinkTimer = win.setTimeout(() => {
			blinkTimer = 0; panel.dataset.markerIdle = "true";
		}, 600);
	}
	function cancelRender() { win.clearTimeout(timer); timer = 0; pendingText = null; ready = false; }
	function close() { cancelRender(); owner = null; pauseBlink(); panel.remove(); panel.style.visibility = ""; output.replaceChildren(); status.textContent = ""; ownerNode = null; interacting = false; lastText = null; lastHead = undefined; activityText = null; activityHead = undefined; }
	function refresh() {
		frame = 0;
		if (stopped || composing) return;
		const node = (interacting && ownerNode?.isConnected ? ownerNode : doc.activeElement?.closest(".math-node")) as HTMLElement | null;
		const math = (node as any)?.pmViewDesc?.spec;
		if (node && !(node.localName === "math-inline" ? inlineEnabled : displayEnabled)) { close(); return; }
		if (!node || !math?._innerView || typeof math.renderMath !== "function" || !math._mathRenderElt) { close(); return; }
		if (owner !== math) { close(); owner = math; ownerNode = node; }
		const text = math._innerView.state.doc.textContent;
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
		if (!inline) { panel.style.removeProperty("left"); panel.style.removeProperty("top"); return; }
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
	}
	function schedule() { if (!stopped && !frame) frame = win.requestAnimationFrame(refresh); }
	const activity = () => { pauseBlink(); schedule(); };
	const start = () => { composing = true; pauseBlink(); cancelRender(); };
	const end = () => { composing = false; activity(); };
	const viewport = (e: Event) => {
		if ((e.target as Element)?.closest?.("#latex-suite-math-preview, #latex-suite-completion")) return;
		schedule();
	};
	// MathView only stops events from its source editor. Intercept preview
	// pointer/mouse events before they reach ProseMirror or MathView's click
	// handler, while leaving native scrollbar default actions enabled.
	const interaction = (e: Event) => {
		const inside = (e.target as Element)?.closest?.("#latex-suite-math-preview") === panel;
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
	const interactionEvents = ["pointerdown", "mousedown", "pointerup", "pointercancel", "mouseup", "click", "dblclick"];
	interactionEvents.forEach(name => doc.addEventListener(name, interaction, true));
	const wheel = (e: Event) => { e.stopPropagation(); }; // native scrolling stays enabled
	panel.addEventListener("wheel", wheel, { passive: true });
	const listeners: [EventTarget, string, EventListener][] = [
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
