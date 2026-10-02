import { Buffer, Range } from "../editor/buffer";
import { latexTokens, LatexToken } from "../highlight/tokenizer";
import { PMBuffer, rememberSelectionClass } from "../editor/pm";

const pairs: Record<string, string> = { "{": "}", "(": ")", "[": "]", "\\{": "\\}", "\\langle": "\\rangle", "\\lvert": "\\rvert", "\\lVert": "\\rVert", "\\lfloor": "\\rfloor", "\\lceil": "\\rceil" };
const closers = new Set(Object.values(pairs));
// Known two-argument forms must not create a misleading half-command region.
const argumentCounts: Record<string, number> = { "\\frac": 2, "\\dfrac": 2, "\\tfrac": 2, "\\binom": 2, "\\dbinom": 2, "\\tbinom": 2 };
const structural = new Set(["\\left", "\\middle", "\\right", "\\begin", "\\end", "\\verb", "\\verb*", "\\limits", "\\nolimits", "\\displaystyle", "\\textstyle", ...Object.keys(pairs), ...closers]);

/** Conservative source regions; never executes TeX or modifies the document. */
export type MathDelimiter = { range: Range; partners?: Range[] };
export function mathStructure(source: string, tokens: LatexToken[] = latexTokens(source)) {
	const commands = new Map(tokens.filter(t => t.kind === "command").map(t => [t.from, t.to]));
	const regions: Range[] = [];
	const outerRegions: Range[] = [];
	const delimiters: MathDelimiter[] = [];
	const register = (from: number, to: number) => { const item: MathDelimiter = { range: { from, to } };delimiters.push(item);return item; };
	const connect = (items: MathDelimiter[]) => { const ranges = items.map(item => item.range);for (const item of items) item.partners = ranges;outerRegions.push({ from: ranges[0].from, to: ranges[ranges.length - 1].to }); };
	const groups = new Map<number, number>();
	const stack: { close: string; from: number; content: number; scalable: boolean; marker?: MathDelimiter; middles?: MathDelimiter[] }[] = [];
	let skipUntil = -1;
	for (const t of tokens) {
		if (t.from < skipUntil || t.kind === "comment" || t.kind === "text" || t.literal && t.kind === "command") continue;
		const value = source.slice(t.from, t.to);
		if (["\\left", "\\middle", "\\right"].includes(value)) {
			// Delimiters can be literal or commands. Never treat a \middle bar
			// as the opening/closing bar of an absolute-value region.
			const tail = source.slice(t.to).match(/^\s*(\\[a-zA-Z]+|\\[^\s]|[()[\]{}|.<>/])/);
			if (!tail) { register(t.from, t.to);continue; }
			skipUntil = t.to + tail[0].length;
			const marker = register(t.from, skipUntil);
			if (value === "\\left") stack.push({ close: "\\right", from: t.from, content: skipUntil, scalable: true, marker, middles: [] });
			else if (value === "\\middle") {
				const top = stack[stack.length - 1];
				if (top?.scalable) top.middles!.push(marker);
			}
			else if (value === "\\right") {
				const top = stack[stack.length - 1];
				if (top?.scalable) { stack.pop();regions.push({ from: top.content, to: t.from });connect([top.marker!, ...top.middles!, marker]); }
			}
			continue;
		}
		const top = stack[stack.length - 1];
		// Ignore ambiguous bare | and \|. Explicit \left/\middle/\right
		// bars are handled above; named \lvert/\rvert remain unambiguous.
		if (pairs[value]) stack.push({ close: pairs[value], from: t.from, content: t.to, scalable: false, marker: register(t.from, t.to) });
		else if (closers.has(value)) {
			const marker = register(t.from, t.to);
			if (top?.close === value && !top.scalable) {
				stack.pop();regions.push({ from: top.content, to: t.from });
				connect([top.marker!, marker]);
				if (value === "}") groups.set(top.from, t.to);
			} else {
				// Discard malformed nesting rather than repeatedly searching an
				// unchanged stack (quadratic for long runs of wrong closers).
				while (stack.length) {
					const discarded = stack.pop()!;
					if (!discarded.scalable && discarded.close === value) break;
				}
			}
		}
	}
	const environments: { name: string; from: number; content: number }[] = [];
	const environmentHeader = /\s*\{([A-Za-z0-9*_-]+)\}/y;
	const commandBases = new Map<number, number>();
	for (const token of tokens) {
		const command = source.slice(token.from, token.to);
		if (token.kind === "command" && !token.literal && (command === "\\begin" || command === "\\end")) {
			environmentHeader.lastIndex = token.to;
			const header = environmentHeader.exec(source);
			if (header) {
				const end = environmentHeader.lastIndex;
				const open = end - header[1].length - 2;
				// Require a real parsed group, not braces in comments/verbatim.
				if (groups.get(open) === end) {
					if (command === "\\begin") environments.push({ name: header[1], from: token.from, content: end });
					else if (environments[environments.length - 1]?.name === header[1]) {
						const environment = environments.pop()!;
						regions.push({ from: environment.content, to: token.from });
						outerRegions.push({ from: environment.from, to: end });
					} else environments.length = 0; // Never guess crossed/mismatched pairs.
				}
			}
			continue;
		}
		if (token.kind !== "command" || token.literal || structural.has(command) || !/^\\[a-zA-Z@_]/.test(command)) continue;
		const required = argumentCounts[command];
		let end = token.to, count = 0;
		if (source[end] === "*") end++;
		while (!required || count < required) {
			let cursor = end;
			while (/\s/.test(source[cursor] || "x")) cursor++;
			const close = groups.get(cursor);
			if (close === undefined) break;
			end = close;count++;
		}
		if (required && count !== required) continue;
		if (count) regions.push({ from: token.from, to: end });
		commandBases.set(token.from, end);
	}
	const tokenAt = new Map(tokens.map(token => [token.from, token]));
	const scriptArguments = new Set<number>();
	function skipSpace(from: number): number {
		while (from < source.length) {
			if (/\s/.test(source[from])) from++;
			else if (tokenAt.get(from)?.kind === "comment") from = tokenAt.get(from)!.to;
			else break;
		}
		return from;
	}
	function addScripts(from: number, baseEnd: number) {
		let end = baseEnd, cursor = skipSpace(end);
		const modifier = tokenAt.get(cursor);
		if (modifier?.kind === "command" && !modifier.literal && ["\\limits", "\\nolimits"].includes(source.slice(cursor, modifier.to))) cursor = skipSpace(modifier.to);
		const seen = new Set<string>();
		for (let n = 0; n < 2; n++) {
			const marker = source[cursor];
			if ((marker !== "_" && marker !== "^") || seen.has(marker)) break;
			const argument = skipSpace(cursor + 1), token = tokenAt.get(argument);
			const groupEnd = groups.get(argument);
			let argumentEnd: number;
			if (groupEnd !== undefined) argumentEnd = groupEnd;
			else if (token?.kind === "command" && !token.literal && !structural.has(source.slice(argument, token.to))) argumentEnd = token.to;
			else if (argument < source.length && !"{}_^%\\".includes(source[argument])) argumentEnd = argument + (source.codePointAt(argument)! > 0xffff ? 2 : 1);
			else break;
			// In x_i^2, i is an unbraced script argument, not an i^2 base.
			if (groupEnd === undefined) scriptArguments.add(argument);
			seen.add(marker);end = argumentEnd;cursor = skipSpace(end);
		}
		if (end > baseEnd) regions.push({ from, to: end });
	}
	// Walk source atoms in order, skipping literal/comment/environment tokens.
	// Plain TeX letters/digits are single atoms, not entire identifier words.
	for (let from = 0; from < source.length;) {
		const token = tokenAt.get(from), commandEnd = commandBases.get(from);
		const char = String.fromCodePoint(source.codePointAt(from)!);
		if (!scriptArguments.has(from)) {
			if (commandEnd !== undefined) addScripts(from, commandEnd);
			else if ((!token || token.kind === "number") && /[\p{L}\p{N}\p{S}]/u.test(char)) addScripts(from, from + char.length);
		}
		from = token && token.kind !== "number" ? token.to : from + char.length;
	}
	regions.push({ from: 0, to: source.length });
	return { regions: regions.filter(r => r.to > r.from), outerRegions, delimiters };
}

export function mathSelectionRegions(source: string, includeOutside = false): Range[] {
	const parsed = mathStructure(source);
	return includeOutside ? [...parsed.regions, ...parsed.outerRegions] : parsed.regions;
}

/** Cached by the caller on source edits. Lookup on caret movement is O(1).
 * Bare symmetric bars are ignored by the shared structural parser.
 */
export function mathDelimiterIndex(source: string, tokens?: LatexToken[]) {
	const index = new Map<number, MathDelimiter>();
	for (const item of mathStructure(source, tokens).delimiters)
		for (let pos = item.range.from; pos <= item.range.to; pos++) index.set(pos, item);
	return index;
}

export function createMathSelection() {
	let owner: object | undefined, source = "", expected: Range | undefined;
	let history: Range[] = [];
	return (buffer: Buffer, shrink: boolean, includeWord = true, includeOutside = false): boolean => {
		if (buffer.kind !== "math_inline" && buffer.kind !== "math_display") return false;
		const current = { from: buffer.from, to: buffer.to };
		if (owner !== buffer.owner || source !== buffer.text || expected?.from !== current.from || expected?.to !== current.to) history = [];
		owner = buffer.owner;source = buffer.text;
		let next: Range | undefined;
		if (shrink) next = history.pop();
		else {
			const candidates = mathSelectionRegions(source, includeOutside);
			// First select a word or command, without splitting UTF-16 characters.
			if (includeWord && current.from === current.to) {
				for (const match of source.matchAll(/\\[a-zA-Z@]+|[\p{L}\p{N}]+/gu)) {
					const from = match.index!, to = from + match[0].length;
					if (from <= current.from && to >= current.to) candidates.push({ from, to });
				}
			}
			next = candidates.filter(r => r.from <= current.from && r.to >= current.to && (r.from < current.from || r.to > current.to))
				.sort((a, b) => (a.to - a.from) - (b.to - b.from))[0];
			if (next) history.push(current);
		}
		if (!next) return false;
		buffer.setSelection(next.from, next.to);expected = next;
		return true;
	};
}

export function mathWordRange(source: string, pos: number): Range {
	for (const match of source.matchAll(/\\[a-zA-Z@_:]+\*?|[\p{L}\p{N}]+/gu)) {
		const from = match.index!, to = from + match[0].length;
		if (from <= pos && to >= pos) return { from, to };
	}
	if (pos >= source.length) return { from: pos, to: pos };
	const from = pos > 0 && /[\uDC00-\uDFFF]/.test(source[pos]) ? pos - 1 : pos;
	return { from, to: from + (source.codePointAt(from)! > 0xffff ? 2 : 1) };
}

/** Own plain left-click caret/word/structural selection in nested math views.
 * Capture the complete mouse gesture before browser/ProseMirror selection.
 */
export function normalizeMathClickTimeout(value: unknown): number {
	const number = typeof value === "number" || typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
	return Number.isFinite(number) ? Math.max(200, Math.min(5000, Math.floor(number))) : 1000;
}

export function installMathMouseSelection(win: Window, onSelect: () => void = () => {}, timeout: () => number = () => 1000) {
	const doc = win.document;
	let expand = createMathSelection(), composing = false, stopped = false;
	let series: { view: any; source: string; x: number; y: number; time: number; count: number; selected?: Range; anchor: number; down: boolean } | undefined;
	let gesture: typeof series;
	function reset() { expand = createMathSelection();series = undefined;gesture = undefined; }
	function compositionStart() { composing = true;reset(); }
	function compositionEnd() { composing = false; }
	function position(view: any, event: MouseEvent) {
		try { const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });if (hit) return Math.max(0, Math.min(view.state.doc.content.size, hit.pos)); }
		catch { /* layout-less tests or a view being torn down */ }
		return view.state.selection.from;
	}
	function mousedown(event: MouseEvent) {
		gesture = undefined;
		if (composing || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) { reset();return; }
		const target = event.target as Element;
		const node = target?.closest?.(".math-node");
		const view = (node as any)?.pmViewDesc?.spec?._innerView;
		if (!view || view.isDestroyed || view.editable === false || !view.dom.contains(target)) { reset();return; }
		const source = view.state.doc.textContent;
		const continuing = series && series.view === view && series.source === source && event.timeStamp - series.time < normalizeMathClickTimeout(timeout())
			&& Math.abs(event.clientX - series.x) <= 5 && Math.abs(event.clientY - series.y) <= 5;
		const count = continuing ? Math.max(series!.count + 1, event.detail || 1) : Math.max(1, event.detail);
		const selected = continuing ? series?.selected : undefined;
		const anchor = position(view, event);
		series = { view, source, x: event.clientX, y: event.clientY, time: event.timeStamp, count, anchor, down: true };
		rememberSelectionClass(view);
		const kind = node!.tagName.toLowerCase() === "math-display" ? "math_display" : "math_inline";
		event.preventDefault();event.stopImmediatePropagation();
		const buffer = PMBuffer.forMath(view, kind);
		if (count === 1) buffer.setSelection(anchor);
		else if (count === 2) { const word = mathWordRange(source, anchor);buffer.setSelection(word.from, word.to); }
		else {
			if (selected) buffer.setSelection(selected.from, selected.to);
			expand(PMBuffer.forMath(view, kind), false, false, true);
		}
		series.selected = { from: view.state.selection.from, to: view.state.selection.to };
		gesture = series;
		view.focus();onSelect();
	}
	function finish(event: MouseEvent) {
		if (!gesture || event.button !== 0 || composing) return;
		const { view, source, selected } = gesture;
		if (view.isDestroyed || view.editable === false || view.state.doc.textContent !== source) { reset();return; }
		event.preventDefault();event.stopImmediatePropagation();
		if (event.type === "mouseup") gesture.down = false;
		// Protect the chosen extent from native mouseup/click/dblclick selection.
		if (selected) {
			const kind = view.dom.closest("math-display") ? "math_display" : "math_inline";
			PMBuffer.forMath(view, kind).setSelection(selected.from, selected.to);
		}
	}
	function mousemove(event: MouseEvent) {
		if (!gesture?.down || gesture.count !== 1 || composing) return;
		const { view, source, anchor } = gesture;
		if (view.isDestroyed || view.state.doc.textContent !== source) { reset();return; }
		const end = position(view, event);
		const kind = view.dom.closest("math-display") ? "math_display" : "math_inline";
		PMBuffer.forMath(view, kind).setSelection(anchor, end);
		gesture.selected = { from: anchor, to: end };
		// A drag is not the start of a subsequent multi-click expansion series.
		if (end !== anchor) series = undefined;
		event.preventDefault();event.stopImmediatePropagation();
	}
	function selectstart(event: Event) {
		if (gesture?.down && gesture.view.dom.contains(event.target)) { event.preventDefault();event.stopImmediatePropagation(); }
	}
	doc.addEventListener("mousedown", mousedown, true);
	doc.addEventListener("mousemove", mousemove, true);
	doc.addEventListener("selectstart", selectstart, true);
	for (const type of ["mouseup", "click", "dblclick"]) doc.addEventListener(type, finish as EventListener, true);
	doc.addEventListener("compositionstart", compositionStart, true);
	doc.addEventListener("compositionend", compositionEnd, true);
	doc.addEventListener("latex-suite-settings-changed", reset);
	doc.addEventListener("keydown", reset, true);
	doc.addEventListener("beforeinput", reset, true);
	win.addEventListener("unload", stop);
	function stop() {
		if (stopped) return;
		stopped = true;
		doc.removeEventListener("mousedown", mousedown, true);
		doc.removeEventListener("mousemove", mousemove, true);
		doc.removeEventListener("selectstart", selectstart, true);
		for (const type of ["mouseup", "click", "dblclick"]) doc.removeEventListener(type, finish as EventListener, true);
		doc.removeEventListener("compositionstart", compositionStart, true);
		doc.removeEventListener("compositionend", compositionEnd, true);
		doc.removeEventListener("latex-suite-settings-changed", reset);
		doc.removeEventListener("keydown", reset, true);
		doc.removeEventListener("beforeinput", reset, true);
		win.removeEventListener("unload", stop);reset();
	}
	return stop;
}
