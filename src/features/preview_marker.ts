import { latexTokens } from "../highlight/tokenizer";

export const PREVIEW_CARET = "\\htmlClass{ls-preview-caret}{\\text{$\\rule[-0.15em]{0.065em}{0.9em}$}}";

export function previewMarkerColor(value: unknown): string {
	return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : "#d9468f";
}

/** Preview-only approximation: never split a control sequence or metadata. */
export function previewMarkerSource(source: string, head: number): string {
	let pos = Math.max(0, Math.min(source.length, head));
	const tokens = latexTokens(source);
	for (const token of tokens) {
		if (["command", "environment", "comment", "number", "escape", "parameter"].includes(token.kind)
			&& pos > token.from && pos < token.to) pos = token.from;
	}
	// At a gap between required arguments, put the marker inside the next
	// group instead of letting it become the command's argument itself.
	for (const token of tokens) {
		if (token.kind !== "command") continue;
		const name = source.slice(token.from + 1, token.to);
		const count = /^(?:[dtc]?frac|[dt]?binom|overset|underset|stackrel)$/.test(name) ? 2
			: /^(?:sqrt|math(?:bb|bf|cal|frak|it|rm|sf|tt|normal)|text(?:rm|sf|tt|normal|bf|it|up|md)?|operatorname|overline|underline|hat|widehat|tilde|widetilde|vec|dot|ddot|dddot|ddddot|bar|breve|check|acute|grave|overbrace|underbrace)$/.test(name) ? 1 : 0;
		// Optional root indices are syntax, not ordinary visible math positions.
		if (name === "sqrt" && pos === token.to && /^\s*\[/.test(source.slice(token.to))) pos = token.from;
		let end = token.to;
		for (let arg = 0; arg < count; arg++) {
			let open = end;
			while (/\s/.test(source[open] || "x")) open++;
			if (source[open] !== "{") break;
			if (pos >= end && pos <= open) pos = open + 1;
			let depth = 1, next = open + 1;
			for (; next < source.length && depth; next++) {
				if (source[next] === "\\") { next++; continue; }
				if (source[next] === "{") depth++;
				if (source[next] === "}") depth--;
			}
			if (depth) break;
			end = next;
		}
	}
	// A marker cannot serve as a script argument or a scalable delimiter.
	const prefix = source.slice(0, pos);
	const required = /(?:[_^]|\\(?:left|right|middle))\s*$/.exec(prefix);
	if (required) pos = required.index;
	// Environment names / array column specifications are not rendered text.
	const metadata = /\\(?:begin|end)\s*\{[^}]*\}(?:\s*\{[^}]*\})?/g;
	for (const match of source.matchAll(metadata)) {
		if (pos > match.index! && pos < match.index! + match[0].length) pos = match.index!;
	}
	// Avoid splitting UTF-16 surrogate pairs.
	if (pos > 0 && /[\uDC00-\uDFFF]/.test(source[pos] || "")) pos--;
	// A rule has no spoken glyph and works inside text arguments and scripts.
	return source.slice(0, pos) + PREVIEW_CARET + source.slice(pos);
}

/** Same bundled renderer/options, isolated DOM and source; no native-view writes. */
export function renderPreviewMarker(math: any, target: HTMLElement, source: string, head: number): boolean {
	const rendered = target.ownerDocument.createElement("div");
	const facade = {
		_node: { content: { firstChild: { textContent: previewMarkerSource(source, head) } } },
		_mathRenderElt: rendered,
		_katexOptions: {
			...math._katexOptions, macros: { ...math._katexOptions?.macros },
			// Allow only our styling wrapper, never arbitrary HTML, links or URLs.
			trust: (context: any) => context.command === "\\htmlClass" && context.class === "ls-preview-caret",
			strict: (code: string, ...args: any[]) => code === "htmlExtension" ? "ignore"
				: typeof math._katexOptions?.strict === "function" ? math._katexOptions.strict(code, ...args) : math._katexOptions?.strict ?? "warn",
		},
		dom: target.ownerDocument.createElement("div"),
	};
	try {
		math.renderMath.call(facade);
		if (rendered.classList.contains("parse-error") || rendered.querySelector(".katex-error")) return false;
		rendered.querySelectorAll(".ls-preview-caret").forEach(marker => marker.setAttribute("aria-hidden", "true"));
		target.replaceChildren(...Array.from(rendered.childNodes));
		return true;
	} catch { return false; }
}
