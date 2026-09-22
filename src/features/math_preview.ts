/** View-only previews using the renderer already owned by Zotero's MathView. */
export function installMathPreview(win: Window) {
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
	function close() { panel.remove(); panel.style.visibility = ""; output.replaceChildren(); status.textContent = ""; owner = null; lastText = null; }
	function refresh() {
		frame = 0;
		if (stopped || composing) return;
		const node = doc.activeElement?.closest(".math-node") as HTMLElement | null;
		const math = (node as any)?.pmViewDesc?.spec;
		if (!node || !math?._innerView || typeof math.renderMath !== "function" || !math._mathRenderElt) { close(); return; }
		if (owner !== math) { close(); owner = math; }
		const text = math._innerView.state.doc.textContent;
		if (text !== lastText) {
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
		const inline = node.tagName.toLowerCase() === "math-inline";
		panel.dataset.inline = String(inline);
		const parent = inline ? doc.body : node;
		if (panel.parentNode !== parent) parent.append(panel);
		if (!inline) { panel.style.removeProperty("left"); panel.style.removeProperty("top"); return; }
		const anchor = node.getBoundingClientRect(), width = panel.offsetWidth, height = panel.offsetHeight;
		let top = anchor.bottom + 6;
		if (top + height > win.innerHeight - 8) top = anchor.top - height - 6;
		const menu = doc.getElementById("latex-suite-completion")?.getBoundingClientRect();
		let left = Math.max(8, Math.min(anchor.left, win.innerWidth - width - 8));
		if (menu && left < menu.right && left + width > menu.left && top < menu.bottom && top + height > menu.top) {
			if (menu.top - height - 6 >= 8) top = menu.top - height - 6;
			else if (menu.bottom + height + 6 < win.innerHeight - 8) top = menu.bottom + 6;
			else if (menu.right + width + 6 < win.innerWidth - 8) left = menu.right + 6;
			else { panel.style.visibility = "hidden"; return; }
		}
		panel.style.visibility = "";
		panel.style.left = `${left}px`;
		panel.style.top = `${Math.max(8, top)}px`;
	}
	function schedule() { if (!stopped && !frame) frame = win.requestAnimationFrame(refresh); }
	const start = () => { composing = true; };
	const end = () => { composing = false; schedule(); };
	const listeners: [EventTarget, string, EventListener][] = [
		[doc, "input", schedule], [doc, "keydown", schedule], [doc, "selectionchange", schedule],
		[doc, "focusin", schedule], [doc, "focusout", schedule], [doc, "scroll", schedule],
		[win, "resize", schedule], [doc, "compositionstart", start], [doc, "compositionend", end],
	];
	listeners.forEach(([target, name, fn]) => target.addEventListener(name, fn, true));
	// Includes snippet/completion transactions that do not dispatch DOM input.
	const observer = new (win as any).MutationObserver((records: MutationRecord[]) => {
		if (records.some(r => {
			const el = r.target.nodeType === 1 ? r.target as Element : r.target.parentElement;
			return el?.closest(".math-src, #latex-suite-completion") ||
				Array.from(r.addedNodes).concat(Array.from(r.removedNodes)).some(n => (n as Element).id === "latex-suite-completion");
		})) schedule();
	});
	observer.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["style"] });
	schedule();
	return () => {
		stopped = true; win.cancelAnimationFrame(frame); observer.disconnect(); close(); style.remove();
		listeners.forEach(([target, name, fn]) => target.removeEventListener(name, fn, true));
	};
}
