/** View-only previews using the renderer already owned by Zotero's MathView. */
export function installMathPreview(win: Window, debounceMs = 100) {
	const delay = Number.isFinite(debounceMs) ? Math.max(0, Math.min(2000, debounceMs)) : 100;
	const doc = win.document;
	const panel = doc.createElement("div");
	panel.id = "latex-suite-math-preview";
	panel.contentEditable = "false";
	panel.setAttribute("role", "region");
	panel.setAttribute("aria-label", "Equation preview");
	const output = doc.createElement("div"), status = doc.createElement("div");
	status.className = "ls-preview-status";
	panel.append(output, status);
	const style = doc.createElement("style");
	style.textContent = `#latex-suite-math-preview{box-sizing:border-box;padding:10px;background:Canvas;color:CanvasText;color-scheme:light dark;border:1px solid GrayText;border-radius:5px;overflow:auto;max-height:35vh;font:initial;pointer-events:none}#latex-suite-math-preview[data-inline=true]{position:fixed;z-index:2147483646;max-width:calc(100vw - 16px);box-shadow:0 3px 12px #0003}#latex-suite-math-preview[data-inline=false]{display:block;margin-top:8px;width:100%}#latex-suite-math-preview .ls-preview-status{font:11px sans-serif;color:GrayText;margin-top:4px}#latex-suite-math-preview .ls-preview-status:empty{display:none}#latex-suite-math-preview .katex-display{margin:0}`;
	doc.head.append(style);
	let frame = 0, stopped = false, composing = false;
	let owner: any = null, lastText: string | null = null;
	let timer = 0, pendingText: string | null = null, ready = false;
	function cancelRender() { win.clearTimeout(timer); timer = 0; pendingText = null; ready = false; }
	function close() { cancelRender(); panel.remove(); panel.style.visibility = ""; output.replaceChildren(); status.textContent = ""; owner = null; lastText = null; }
	function refresh() {
		frame = 0;
		if (stopped || composing) return;
		const node = doc.activeElement?.closest(".math-node") as HTMLElement | null;
		const math = (node as any)?.pmViewDesc?.spec;
		if (!node || !math?._innerView || typeof math.renderMath !== "function" || !math._mathRenderElt) { close(); return; }
		if (owner !== math) { close(); owner = math; }
		const text = math._innerView.state.doc.textContent;
		if (text === lastText) cancelRender();
		else if (text !== pendingText) {
			cancelRender(); pendingText = text;
			if (delay === 0) ready = true;
			else timer = win.setTimeout(() => { timer = 0; ready = true; schedule(); }, delay);
		}
		if (text !== lastText && ready) {
			cancelRender();
			lastText = text;
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
	const start = () => { composing = true; cancelRender(); };
	const end = () => { composing = false; schedule(); };
	const viewport = (e: Event) => {
		if ((e.target as Element)?.closest?.("#latex-suite-completion")) return;
		schedule();
	};
	const listeners: [EventTarget, string, EventListener][] = [
		[doc, "input", schedule], [doc, "keydown", schedule], [doc, "selectionchange", schedule],
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
		listeners.forEach(([target, name, fn]) => target.removeEventListener(name, fn, true));
	};
}
