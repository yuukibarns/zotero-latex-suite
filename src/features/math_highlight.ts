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
.math-node .ls-conceal-symbol::after{content:attr(data-symbol);font-size:var(--ls-conceal-font-size);pointer-events:none}
.math-node .ls-conceal-bold{font-weight:bold}
.math-node .ls-conceal-roman{font-style:normal}
.math-node .ls-conceal-underline{text-decoration:underline}
/* Keyword super/sub uses the hidden parent's zero-size font metrics. Position
 * scripts with the original editor font size, like their visible glyph size. */
.math-node .ls-conceal-symbol.ls-conceal-sup::after{font-size:calc(var(--ls-conceal-font-size)*0.8);vertical-align:calc(var(--ls-conceal-font-size)*0.4)}
.math-node .ls-conceal-symbol.ls-conceal-sub::after{font-size:calc(var(--ls-conceal-font-size)*0.8);vertical-align:calc(var(--ls-conceal-font-size)*-0.2)}
`;
	doc.head.append(style);
	const attached = new Map<any, { original: any; provider: any; oldSize: string }>();
	let frame = 0, stopped = false;
	function detach(view: any) {
		const entry = attached.get(view);
		if (!entry) return;
		// Do not overwrite another extension's later direct-prop replacement.
		if (!view.isDestroyed && view.props.decorations === entry.provider) view.setProps({ decorations: entry.original });
		if (conceal) {
			if (entry.oldSize) view.dom.style.setProperty('--ls-conceal-font-size', entry.oldSize);
			else view.dom.style.removeProperty('--ls-conceal-font-size');
		}
		attached.delete(view);
	}
	function scan() {
		frame = 0;
		if (stopped) return;
		for (const view of attached.keys()) if (view.isDestroyed || !view.dom.isConnected) detach(view);
		const views = Array.from(doc.querySelectorAll(".math-node")).map(el => (el as any).pmViewDesc?.spec?._innerView).filter(view => view?.props && typeof view.setProps === "function" && !view.isDestroyed);
		for (const view of views) {
			if (!view?.props || typeof view.setProps !== "function" || view.isDestroyed || attached.has(view)) continue;
			const original = view.props.decorations;
			const oldSize = view.dom.style.getPropertyValue('--ls-conceal-font-size');
			if (conceal) view.dom.style.setProperty('--ls-conceal-font-size', win.getComputedStyle(view.dom).fontSize);
			let ranges: ReturnType<typeof concealRanges> = [];
			let cachedDoc: any, cached: DecorationSet;
			let pairIndex: Map<number, MathDelimiter>;
			let active: MathDelimiter | undefined, displayed: DecorationSet | null = null;
			const provider = (state: any) => {
				if (cachedDoc !== state.doc) {
					cachedDoc = state.doc;
					const source = state.doc.textContent, tokens = latexTokens(source);
					ranges = conceal ? concealRanges(source) : [];
					pairIndex = mathDelimiterIndex(source, tokens);
					active = undefined;displayed = null;
					cached = DecorationSet.create(state.doc, (highlight ? tokens : []).map(token =>
						Decoration.inline(token.from, token.to, { class: token.kind === "command" && /^\\(?:left|middle|right)$/.test(source.slice(token.from, token.to)) ? "ls-tex-command ls-tex-boundary" : `ls-tex-${token.kind}` })));
				}
				const match = highlight && state.selection.from === state.selection.to ? pairIndex.get(state.selection.from) : undefined;
				if (!displayed || active !== match) {
					active = match;
					displayed = match ? cached.add(state.doc, (match.partners || [match.range]).map(range => Decoration.inline(range.from, range.to, { class: match.partners ? "ls-tex-match" : "ls-tex-unmatched" }))) : cached;
				}
				const previous = original?.(state);
				const result = conceal && !view.composing ? displayed.add(state.doc, concealDecorations(ranges, state.selection.from, state.selection.to)) : displayed;
				return previous ? DecorationSet.create(state.doc, [...previous.find(), ...result.find()]) : result;
			};
			attached.set(view, { original, provider, oldSize });
			view.setProps({ decorations: provider });
		}
	}
	function schedule() { if (!stopped && !frame) frame = win.requestAnimationFrame(scan); }
	// Token spans and preview updates do not create editors. Only rescan for
	// editor/node insertion or teardown, not every decoration DOM mutation.
	const observer = new (win as any).MutationObserver((records: MutationRecord[]) => {
		for (const view of attached.keys()) if (view.isDestroyed || !view.dom.isConnected) { schedule();return; }
		for (const record of records) for (const node of Array.from(record.addedNodes)) {
			if (node.nodeType !== 1) continue;
			const element = node as Element;
			if (element.matches(".math-node,.math-src,.ProseMirror") || element.querySelector(".math-node,.math-src,.ProseMirror")) { schedule();return; }
		}
	});
	observer.observe(doc.body, { childList: true, subtree: true });
	doc.addEventListener("focusin", schedule);
	win.addEventListener("unload", stop);
	schedule();
	function stop() {
		if (stopped) return;
		stopped = true;
		observer.disconnect();
		if (frame) win.cancelAnimationFrame(frame);
		doc.removeEventListener("focusin", schedule);
		win.removeEventListener("unload", stop);
		for (const view of attached.keys()) detach(view);
		style.remove();
	}
	return stop;
}
