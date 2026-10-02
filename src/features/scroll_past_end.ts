/** Editor-only scroll space; no attributes, styles or nodes added to the document. */
export function installScrollPastEnd(win: Window) {
	const doc = win.document, style = doc.createElement("style");
	style.id = "latex-suite-scroll-past-end";
	(doc.head || doc.documentElement).append(style);
	let owner: HTMLElement | null = null, frame = 0, stopped = false;
	const observer = (win as any).ResizeObserver ? new (win as any).ResizeObserver(() => schedule()) : null;
	function refresh() {
		frame = 0;
		if (stopped) return;
		const editor = doc.querySelector<HTMLElement>(".editor-core .primary-editor[contenteditable='true']");
		const next = editor?.closest<HTMLElement>(".editor-core") || null;
		if (next !== owner) { observer?.disconnect(); owner = next; if (owner) observer?.observe(owner); }
		if (!owner || !editor) { style.textContent = ""; return; }
		const css = win.getComputedStyle(editor);
		const line = parseFloat(css.lineHeight) || (parseFloat(css.fontSize) || 16) * 1.5;
		const space = Math.max(0, owner.clientHeight - line);
		const rule = `@media screen { .editor-core .primary-editor[contenteditable='true'] { padding-bottom: max(var(--editor-padding-block, 20px), ${space}px) !important; } }`;
		if (style.textContent !== rule) style.textContent = rule;
	}
	function schedule() { if (!frame && !stopped) frame = win.requestAnimationFrame(refresh); }
	// React creates the editor asynchronously and can replace it on note switches.
	const mutations = new (win as any).MutationObserver(records => {
		if (records.some((record: MutationRecord) => !style.contains(record.target))) schedule();
	});
	mutations.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["contenteditable"] });
	win.addEventListener("resize", schedule);
	win.addEventListener("message", schedule);
	schedule();
	return () => { stopped = true; win.cancelAnimationFrame(frame); observer?.disconnect(); mutations.disconnect(); win.removeEventListener("resize", schedule); win.removeEventListener("message", schedule); style.remove(); };
}
