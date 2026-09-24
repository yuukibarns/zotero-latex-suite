import { getActiveMathView, getEditorCore } from "../editor/pm";

/** Normalize paired TeX delimiters, preserving code and existing dollar math. */
export function normalizeMathPaste(source: string): string {
	return scanMathPaste(source);
}

function scanMathPaste(source: string, emit?: (body: string, display: boolean) => string): string {
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
			while ((end = source.indexOf(delimiter, end)) >= 0) {
				let slashes = 0;
				for (let p = end - 1; p >= 0 && source[p] === "\\"; p--) slashes++;
				if (slashes % 2 === 0) break;
				end += delimiter.length;
			}
			if (end >= 0) {
				const body = source.slice(i + delimiter.length, end);
				const display = delimiter === "$$";
				const valid = body.trim() && !/\n\s*\n/.test(body) && (display ||
					(!/\s/.test(body[0]) && !/\s/.test(body[body.length - 1]) && !body.includes("\n") && !/\d/.test(source[end + 1] || "")));
				if (emit && valid) out += emit(body.trim(), display);
				else out += source.slice(i, end + delimiter.length);
				i = end + delimiter.length; continue;
			}
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
						out += emit ? emit(body, open === "[") : open === "(" ? `$${body}$` : `\n\n$$\n${body}\n$$\n\n`;
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

/** Parse into a staged transaction: temporary markers never enter the editor. */
export function mathPasteTransaction(view: any, parser: any, source: string): any | null {
	let prefix = "ZLSMATHPLACEHOLDER";
	while (source.includes(prefix) || view.state.doc.textContent.includes(prefix)) prefix += "X";
	const spans: { marker: string; body: string; display: boolean }[] = [];
	const markdown = scanMathPaste(source, (body, display) => {
		const marker = `${prefix}${spans.length}END`;
		spans.push({marker, body, display});
		return display ? `\n\n${marker}\n\n` : marker;
	});
	if (!spans.length) return null;
	let tr: any = null;
	try {
		// Zotero's insertMarkdown only needs this.view.state and dispatch. Calling
		// it on a facade avoids swapping or monkey-patching the live plugin view.
		const facade = Object.create(parser);
		facade.view = { state: view.state, dispatch: (transaction: any) => { tr = transaction; } };
		if (!parser.insertMarkdown.call(facade, markdown) || !tr) return null;
		const replacements: {from: number; to: number; node: any}[] = [];
		for (const span of spans) {
			let count = 0;
			tr.doc.descendants((node: any, pos: number, parent: any) => {
				if (!node.isText) return;
				let index = node.text.indexOf(span.marker);
				while (index >= 0) {
					count++;
					if (parent.type.spec.code || node.marks.some((m: any) => /code/i.test(m.type.name))) throw new Error("Marker in code");
					const type = view.state.schema.nodes[span.display ? "math_display" : "math_inline"];
					if (!type) throw new Error("Missing math schema");
					let from = pos + index, to = from + span.marker.length;
					if (span.display) {
						if (parent.type.name !== "paragraph" || parent.textContent !== span.marker) throw new Error("Invalid display marker");
						from = pos - 1; to = from + parent.nodeSize;
					}
					replacements.push({from, to, node: type.create(null, view.state.schema.text(span.body), span.display ? [] : node.marks)});
					index = node.text.indexOf(span.marker, index + span.marker.length);
				}
			});
			if (count !== 1) return null;
		}
		for (const r of replacements.sort((a,b) => b.from - a.from)) tr.replaceWith(r.from, r.to, r.node);
		tr.doc.check();
		return tr.setMeta("closeHistory$", true).scrollIntoView();
	} catch { return null; }
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
		// Zotero 10's own Markdown plugin preserves tables, lists and native math.
		const parser = view.state.plugins.map((plugin: any) => plugin.getState(view.state))
			.find((state: any) => typeof state?.insertMarkdown === "function");
		if (!parser) return;
		const tr = mathPasteTransaction(view, parser, text);
		if (tr) {
			view.dispatch(tr);
			event.preventDefault(); event.stopImmediatePropagation();
			view.dispatch(view.state.tr.setMeta("closeHistory$", true));
		}
	};
	win.document.addEventListener("paste", onPaste, true);
	return () => win.document.removeEventListener("paste", onPaste, true);
}
