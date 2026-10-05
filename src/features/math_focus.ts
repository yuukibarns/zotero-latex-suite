/** Zotero restores note focus through the outer ProseMirror view. An open math
 * node has a separate inner selection; focus that view instead of painting the
 * outer NodeSelection across the whole equation. No selection rewrite/timer.
 */
export function installMathFocus(win: Window): () => void {
	const doc = win.document;
	const hooks = new Map<any, () => void>();
	function scan() {
		for (const node of doc.querySelectorAll<HTMLElement>(".math-node")) {
			const outer = (node as any).pmViewDesc?.spec?._outerView;
			if (!outer || typeof outer.focus !== "function" || hooks.has(outer)) continue;
			const original = outer.focus, descriptor = Object.getOwnPropertyDescriptor(outer, "focus");
			function focus(this: any, ...args: any[]) {
				if (this === outer && !outer.isDestroyed && outer.editable !== false) {
					for (const el of outer.dom.querySelectorAll(".math-node")) {
						const math = el.pmViewDesc?.spec, inner = math?._innerView;
						if (el.isConnected && math?._outerView === outer && inner && !inner.isDestroyed && inner.editable !== false
							&& outer.state.selection.node === math._node && typeof inner.focus === "function") {
							return inner.focus();
						}
					}
				}
				return original.apply(this, args);
			}
			outer.focus = focus;
			hooks.set(outer, () => {
				if (outer.focus !== focus) return;
				if (descriptor) Object.defineProperty(outer, "focus", descriptor);
				else delete outer.focus;
			});
		}
		for (const [outer, restore] of hooks) if (outer.isDestroyed || !outer.dom.isConnected) { restore(); hooks.delete(outer); }
	}
	const observer = new (win as any).MutationObserver(scan);
	observer.observe(doc.body, {subtree:true, childList:true});
	scan();
	return () => { observer.disconnect(); for (const restore of hooks.values()) restore(); hooks.clear(); };
}
