import { getActiveMathView, getEditorCore } from "../editor/pm";

/** Normalize paired TeX delimiters, preserving code and existing dollar math. */
export function normalizeMathPaste(source: string): string {
	let out = "", i = 0;
	while (i < source.length) {
		// Fenced and indented code are literal. Consume a whole fence, including
		// an unfinished one, so examples of delimiters are never rewritten.
		if (i === 0 || source[i - 1] === "\n") {
			const rest = source.slice(i);
			const fence = /^( {0,3})(`{3,}|~{3,})[^\n]*(?:\n|$)/.exec(rest);
			if (fence) {
				const marker = fence[2][0], length = fence[2].length;
				const end = new RegExp(`^ {0,3}${marker}{${length},}[ \\t]*$`, "m").exec(rest.slice(fence[0].length));
				const n = end ? fence[0].length + end.index + end[0].length : rest.length;
				out += rest.slice(0, n); i += n; continue;
			}
			const indent = /^(?: {4}|\t)[^\n]*(?:\n|$)/.exec(rest);
			if (indent) { out += indent[0]; i += indent[0].length; continue; }
		}
		if (source[i] === "`") {
			const run = /^`+/.exec(source.slice(i))![0];
			const end = source.indexOf(run, i + run.length);
			const n = end < 0 ? source.length : end + run.length;
			out += source.slice(i, n); i = n; continue;
		}
		if (source[i] === "$") {
			const delimiter = source[i + 1] === "$" ? "$$" : "$";
			let end = i + delimiter.length;
			while ((end = source.indexOf(delimiter, end)) >= 0 && source[end - 1] === "\\") end += delimiter.length;
			if (end >= 0) { end += delimiter.length; out += source.slice(i, end); i = end; continue; }
		}
		if (source[i] === "\\") {
			const open = source[i + 1];
			if (open === "(" || open === "[") {
				const closing = open === "(" ? ")" : "]";
				let end = i + 2;
				while (end < source.length) {
					if (source[end] === "\\") {
						if (source[end + 1] === closing) break;
						end += 2;
					} else end++;
				}
				if (end < source.length) {
					const body = source.slice(i + 2, end).trim();
					if (body && (open === "[" || !body.includes("\n"))) {
						out += open === "(" ? `$${body}$` : `\n\n$$\n${body}\n$$\n\n`;
						i = end + 2; continue;
					}
				}
			}
			out += source.slice(i, i + 2); i += 2; continue;
		}
		out += source[i++];
	}
	return out;
}

export function installMathPaste(win: Window) {
	const onPaste = (event: ClipboardEvent) => {
		const data = event.clipboardData;
		if (!data || data.files.length || Array.from(data.types).includes("zotero/annotation")) return;
		if (getActiveMathView(win.document)) return; // already editing raw LaTeX
		const core = getEditorCore(win), view = core?.view;
		if (!view || view.editable === false || !view.dom.contains(win.document.activeElement)) return;
		if (view.state.selection.$from.parent.type.spec.code) return;
		const text = data.getData("text/plain");
		// Browser copies commonly contain both HTML and Markdown/plain text.
		// Prefer the text only when it actually contains convertible TeX math;
		// otherwise leave Zotero's rich-text paste entirely untouched.
		const normalized = normalizeMathPaste(text);
		if (normalized === text) return;
		// Zotero 10's own Markdown plugin preserves tables, lists and native math.
		const parser = view.state.plugins.map((plugin: any) => plugin.getState(view.state))
			.find((state: any) => typeof state?.insertMarkdown === "function");
		if (!parser) return;
		view.dispatch(view.state.tr.setMeta("closeHistory$", true));
		if (parser.insertMarkdown(normalized)) {
			event.preventDefault(); event.stopImmediatePropagation();
			view.dispatch(view.state.tr.setMeta("closeHistory$", true));
		}
	};
	win.document.addEventListener("paste", onPaste, true);
	return () => win.document.removeEventListener("paste", onPaste, true);
}
