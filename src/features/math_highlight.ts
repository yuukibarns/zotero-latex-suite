import { Decoration, DecorationSet } from "prosemirror-view";
import { latexTokens } from "../highlight/tokenizer";
import { mathDelimiterIndex, MathDelimiter } from "./math_selection";
import { concealRanges, concealDecorations } from './math_conceal';
export { latexTokens } from "../highlight/tokenizer";

/** Decorate the existing nested view, never rewrite editable HTML or source.
 * Decoration classes have no schema representation, so they aren't saved.
 */
export function installMathHighlight(win: Window, conceal = false, highlight = true): () => void {
	const doc = win.document;
	const style = doc.createElement("style");
	style.id = "latex-suite-math-highlight";
	style.textContent = `
/* Decoration boundaries must preserve typed whitespace, as in display math. */
math-inline.math-node .math-src .ProseMirror{white-space:break-spaces}
.math-node .ls-tex-command{color:light-dark(#0957b4,#8ab4f8)}
.math-node .ls-tex-boundary{color:light-dark(#a3264c,#ff8fac)}
.math-node .ls-tex-match{background:light-dark(#eadff7,#49364f);border-radius:2px;box-shadow:inset 0 -1px light-dark(#81549c,#c19acf)}
.math-node .ls-tex-unmatched{text-decoration:underline wavy light-dark(#b3261e,#ff958d);text-underline-offset:3px}
.math-node .ls-tex-brace{color:light-dark(#8a3700,#e9ad71)}
.math-node .ls-tex-operator{color:light-dark(#8a2578,#dca1d6)}
.math-node .ls-tex-comment{color:light-dark(#526b40,#a1ba89)}
.math-node .ls-tex-environment{color:light-dark(#006b68,#80cbc4)}
.math-node .ls-tex-text{color:inherit}
.math-node .ls-tex-escape{color:light-dark(#0957b4,#8ab4f8)}
.math-node .ls-tex-parameter{color:light-dark(#8a2578,#dca1d6)}
.math-node .ls-tex-number{color:light-dark(#745300,#dfc276)}
.math-node .ls-tex-concealed{font-size:0}
.math-node{--ls-conceal-katex-scale:1.25}
.math-node .ls-conceal-render{display:inline-block;font-size:calc(var(--ls-conceal-font-size)*var(--ls-conceal-katex-scale));color:var(--ls-conceal-text-color);user-select:none}
.math-node .ls-conceal-render .katex{font-size:1em}
.math-node .ls-conceal-render.ls-conceal-sub{font-size:calc(var(--ls-conceal-font-size)*var(--ls-conceal-katex-scale)*0.8);vertical-align:calc(var(--ls-conceal-font-size)*-0.2)}
.math-node .ls-conceal-render.ls-conceal-sup{font-size:calc(var(--ls-conceal-font-size)*var(--ls-conceal-katex-scale)*0.8);vertical-align:calc(var(--ls-conceal-font-size)*0.4)}
.math-node .ls-conceal-symbol::after{content:attr(data-symbol);font-size:var(--ls-conceal-font-size);pointer-events:none}
.math-node .ls-conceal-font-Main-Regular::after{font-family:KaTeX_Main,serif;font-style:normal}
.math-node .ls-conceal-font-AMS-Regular::after{font-family:KaTeX_AMS,serif;font-style:normal}
.math-node .ls-conceal-font-Math-Italic::after{font-family:KaTeX_Math,serif;font-style:italic}
.math-node .ls-conceal-font-Size1-Regular::after{font-family:KaTeX_Size1,serif;font-style:normal}
.math-node .ls-conceal-font-Caligraphic-Regular::after{font-family:KaTeX_Caligraphic,serif;font-style:normal}
.math-node .ls-conceal-font-Script-Regular::after{font-family:KaTeX_Script,serif;font-style:normal;margin-right:var(--ls-conceal-italic-correction,0em)}
.math-node .ls-conceal-font-Caligraphic-Regular::after,
.math-node .ls-conceal-font-Script-Regular::after,
.math-node .ls-conceal-font-Size1-Regular::after,
.math-node .ls-conceal-font-Main-Regular::after,
.math-node .ls-conceal-font-AMS-Regular::after,
.math-node .ls-conceal-font-Math-Italic::after{font-size:calc(var(--ls-conceal-font-size)*var(--ls-conceal-katex-scale))}
.math-node .ls-conceal-bold{font-weight:bold}
.math-node .ls-conceal-roman{font-style:normal}
.math-node .ls-conceal-symbol.ls-conceal-text::after{color:var(--ls-conceal-text-color);font-style:normal}
.math-node .ls-conceal-underline{text-decoration:underline}
/* Keyword super/sub uses the hidden parent's zero-size font metrics. Position
 * scripts with the original editor font size, like their visible glyph size. */
.math-node .ls-conceal-symbol.ls-conceal-sup::after{font-size:calc(var(--ls-conceal-font-size)*0.8);vertical-align:calc(var(--ls-conceal-font-size)*0.4)}
.math-node .ls-conceal-symbol.ls-conceal-sub::after{font-size:calc(var(--ls-conceal-font-size)*0.8);vertical-align:calc(var(--ls-conceal-font-size)*-0.2)}
`;
	doc.head.append(style);
	const attached = new Map<any, { original: any; provider: any; oldSize: string; oldColor: string; composition: () => void }>();
	const resize = conceal && (win as any).ResizeObserver ? new (win as any).ResizeObserver(() => schedule()) : null;
	const theme = conceal ? win.matchMedia?.('(prefers-color-scheme: dark)') : null;
	let frame = 0, stopped = false;
	const compositionUpdates = new Set<any>();
	function detach(view: any) {
		const entry = attached.get(view);
		if (!entry) return;
		// Do not overwrite another extension's later direct-prop replacement.
		if (!view.isDestroyed && view.props.decorations === entry.provider) view.setProps({ decorations: entry.original });
		if (conceal) {
			resize?.unobserve(view.dom);
			view.dom.removeEventListener('compositionstart', entry.composition);
			view.dom.removeEventListener('compositionend', entry.composition);
			if (entry.oldSize) view.dom.style.setProperty('--ls-conceal-font-size', entry.oldSize);
			else view.dom.style.removeProperty('--ls-conceal-font-size');
			if (entry.oldColor) view.dom.style.setProperty('--ls-conceal-text-color', entry.oldColor);
			else view.dom.style.removeProperty('--ls-conceal-text-color');
		}
		attached.delete(view);
		compositionUpdates.delete(view);
	}
	function scan() {
		frame = 0;
		if (stopped) return;
		for (const view of attached.keys()) if (view.isDestroyed || !view.dom.isConnected) detach(view);
		if (conceal) for (const view of attached.keys()) syncMetrics(view);
		for (const view of compositionUpdates) {
			const entry = attached.get(view);
			if (entry && view.props.decorations === entry.provider) view.setProps({decorations:entry.provider});
		}
		compositionUpdates.clear();
		const views = Array.from(doc.querySelectorAll(".math-node")).map(el => (el as any).pmViewDesc?.spec?._innerView).filter(view => view?.props && typeof view.setProps === "function" && !view.isDestroyed);
		for (const view of views) {
			if (!view?.props || typeof view.setProps !== "function" || view.isDestroyed || attached.has(view)) continue;
			const original = view.props.decorations;
			const oldSize = view.dom.style.getPropertyValue('--ls-conceal-font-size');
			const oldColor = view.dom.style.getPropertyValue('--ls-conceal-text-color');
			if (conceal) syncMetrics(view);
			let ranges: ReturnType<typeof concealRanges> = [];
			let cachedDoc: any, cached: DecorationSet;
			let pairIndex: Map<number, MathDelimiter>;
			let active: MathDelimiter | undefined, displayed: DecorationSet | null = null;
			let lastBase: DecorationSet | null = null, lastResult: DecorationSet | null = null;
			let lastFrom = -1, lastTo = -1, lastComposing = false;
			let lastConceal: Decoration[] = [];
			const provider = (state: any) => {
				if (cachedDoc !== state.doc) {
					cachedDoc = state.doc;
					const source = state.doc.textContent, tokens = latexTokens(source);
					ranges = conceal ? concealRanges(source) : [];
					pairIndex = mathDelimiterIndex(source, tokens);
					active = undefined;displayed = null;
					lastResult = null;
					cached = DecorationSet.create(state.doc, (highlight ? tokens : []).map(token =>
						Decoration.inline(token.from, token.to, { class: token.kind === "command" && /^\\(?:left|middle|right)$/.test(source.slice(token.from, token.to)) ? "ls-tex-command ls-tex-boundary" : `ls-tex-${token.kind}` })));
				}
				const match = highlight && state.selection.from === state.selection.to ? pairIndex.get(state.selection.from) : undefined;
				if (!displayed || active !== match) {
					active = match;
					displayed = match ? cached.add(state.doc, (match.partners || [match.range]).map(range => Decoration.inline(range.from, range.to, { class: match.partners ? "ls-tex-match" : "ls-tex-unmatched" }))) : cached;
				}
				const previous = original?.(state);
				const composing = !!view.composing;
				if (!lastResult || lastBase !== displayed || lastFrom !== state.selection.from || lastTo !== state.selection.to || lastComposing !== composing) {
					const next = conceal && !composing ? concealDecorations(ranges, state.selection.from, state.selection.to).sort((a,b)=>a.from-b.from || a.to-b.to) : [];
					// Like upstream, retain parsed specs on selection-only updates.
					// Also retain the set when moving inside the same reveal region.
					if (!lastResult || lastBase !== displayed || next.length !== lastConceal.length || next.some((d,i) => d.from !== lastConceal[i].from || d.to !== lastConceal[i].to || d.spec.concealKey !== lastConceal[i].spec.concealKey))
						lastResult = next.length ? displayed.add(state.doc,next) : displayed;
					lastConceal = next;lastBase = displayed;
					lastFrom = state.selection.from;lastTo = state.selection.to;lastComposing = composing;
				}
				const result = lastResult;
				return previous ? DecorationSet.create(state.doc, [...previous.find(), ...result.find()]) : result;
			};
			const composition = () => { compositionUpdates.add(view); schedule(); };
			attached.set(view, { original, provider, oldSize, oldColor, composition });
			if (conceal) {
				resize?.observe(view.dom);
				view.dom.addEventListener('compositionstart', composition);
				view.dom.addEventListener('compositionend', composition);
			}
			view.setProps({ decorations: provider });
		}
	}
	function syncMetrics(view: any) {
		const computed = win.getComputedStyle(view.dom);
		for (const [name,value] of [['--ls-conceal-font-size',computed.fontSize],['--ls-conceal-text-color',computed.color]])
			if (view.dom.style.getPropertyValue(name) !== value) view.dom.style.setProperty(name,value);
	}
	function schedule() { if (!stopped && !frame) frame = win.requestAnimationFrame(scan); }
	// Token spans and preview updates do not create editors. Only rescan for
	// editor/node insertion or teardown, not every decoration DOM mutation.
	const observer = new (win as any).MutationObserver((records: MutationRecord[]) => {
		if (conceal && records.some(r => r.type === 'attributes' && [...attached.keys()].some(view => (r.target as Element).contains(view.dom)))) { schedule();return; }
		for (const view of attached.keys()) if (view.isDestroyed || !view.dom.isConnected) { schedule();return; }
		for (const record of records) for (const node of Array.from(record.addedNodes)) {
			if (node.nodeType !== 1) continue;
			const element = node as Element;
			if (element.matches(".math-node,.math-src,.ProseMirror") || element.querySelector(".math-node,.math-src,.ProseMirror")) { schedule();return; }
		}
	});
	observer.observe(doc.documentElement, { childList: true, subtree: true, ...(conceal ? {attributes:true,attributeFilter:['class','style']} : {}) });
	theme?.addEventListener('change', schedule);
	doc.addEventListener("focusin", schedule);
	win.addEventListener("unload", stop);
	schedule();
	function stop() {
		if (stopped) return;
		stopped = true;
		observer.disconnect();
		resize?.disconnect();
		theme?.removeEventListener('change', schedule);
		if (frame) win.cancelAnimationFrame(frame);
		doc.removeEventListener("focusin", schedule);
		win.removeEventListener("unload", stop);
		for (const view of attached.keys()) detach(view);
		style.remove();
	}
	return stop;
}
