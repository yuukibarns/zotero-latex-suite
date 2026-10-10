/** Zotero restores note focus through the outer ProseMirror view. An open math
 * node has a separate inner selection; focus that view instead of painting the
 * outer NodeSelection across the whole equation. No selection rewrite/timer.
 */
export function installMathFocus(win: Window): () => void {
	const doc = win.document;
	const hooks = new Map<any, () => void>();
	let stopped = false;
	function scan() {
		if (stopped) return;
		for (const node of Array.from(doc.querySelectorAll<HTMLElement>(".math-node"))) {
			const outer = (node as any).pmViewDesc?.spec?._outerView;
			if (!outer || outer.dom?.ownerDocument !== doc || typeof outer.focus !== "function" || hooks.has(outer)) continue;
			const original = outer.focus,
				descriptor = Object.getOwnPropertyDescriptor(outer, "focus");
			let active = true,
				redirecting = false;
			function focus(this: any, ...args: any[]) {
				if (
					active &&
					!stopped &&
					!redirecting &&
					this === outer &&
					outer.dom.isConnected &&
					!outer.isDestroyed &&
					outer.editable !== false
				) {
					const selection = outer.state?.selection;
					for (const el of outer.dom.querySelectorAll(".math-node")) {
						const math = el.pmViewDesc?.spec,
							inner = math?._innerView;
						if (
							el.isConnected &&
							math?.dom === el &&
							math._outerView === outer &&
							math._isEditing === true &&
							inner &&
							!inner.isDestroyed &&
							inner.editable !== false &&
							inner.dom?.ownerDocument === doc &&
							inner.dom.isConnected &&
							math._mathSrcElt?.contains(inner.dom) &&
							selection?.node === math._node &&
							typeof math._getPos === "function" &&
							selection.from === math._getPos() &&
							typeof inner.focus === "function"
						) {
							// Position matters: the same immutable PM node can occur twice.
							redirecting = true;
							try {
								return inner.focus();
							} finally {
								redirecting = false;
							}
						}
					}
				}
				return original.apply(this, args);
			}
			outer.focus = focus;
			hooks.set(outer, () => {
				// A later wrapper may retain ours. Make that retained function inert.
				active = false;
				if (outer.focus !== focus) return;
				if (descriptor) Object.defineProperty(outer, "focus", descriptor);
				else delete outer.focus;
			});
		}
		for (const [outer, restore] of hooks)
			if (outer.isDestroyed || !outer.dom.isConnected) {
				restore();
				hooks.delete(outer);
			}
	}
	const observer = new (win as any).MutationObserver(scan);
	observer.observe(doc.body, { subtree: true, childList: true });
	scan();
	return () => {
		stopped = true;
		observer.disconnect();
		for (const restore of hooks.values()) restore();
		hooks.clear();
	};
}
