import { getEditorCore } from "../editor/pm";
import { textToken, TextSources, TextSourceSettings } from "./text_sources";

export function annotationToken(view: any) {
	if (!view || view.editable === false) return null;
	const s = view.state.selection;
	if (!s.empty || !s.$from.parent.isTextblock || s.$from.parent.type.spec.code) return null;
	if (s.$from.marks().some((mark: any) => /code/i.test(mark.type.name))) return null;
	for (let d = 1; d <= s.$from.depth; d++) if (/math|code/i.test(s.$from.node(d).type.name)) return null;
	const before = s.$from.parent.textBetween(0, s.$from.parentOffset, "\ufffc", "\ufffc");
	const match = /(?:^|\s)@@([^@\n]*)$/.exec(before);
	return match ? { from: s.from - match[1].length - 2, to: s.from, query: match[1] } : null;
}
export function annotationMatches(items: any[], query: string) {
	const q = query.toLocaleLowerCase().trim();
	return items
		.filter(a =>
			[a.comment, a.text].some(s =>
				String(s || "")
					.toLocaleLowerCase()
					.includes(q),
			),
		)
		.slice(0, 50);
}
export function installAnnotationCompletion(
	win: Window,
	minimum: () => number = () => 2,
	textSettings: () => TextSourceSettings = () => ({
		bufferCompletionEnabled: false,
		dictionaryCompletionEnabled: false,
	}),
) {
	const sources = new TextSources();
	const tokenAt = (view: any) => {
		const annotation = annotationToken(view);
		if (annotation) return { ...annotation, mode: "annotation" };
		const config = textSettings();
		const token = (config.bufferCompletionEnabled || config.dictionaryCompletionEnabled) && textToken(view);
		return token ? { ...token, mode: "text" } : null;
	};
	const doc = win.document,
		panel = doc.createElement("div");
	panel.id = "latex-suite-annotations";
	panel.setAttribute("role", "listbox");
	panel.setAttribute("aria-label", "Annotations");
	panel.style.cssText =
		"position:fixed;z-index:2147483647;background:Canvas;color:CanvasText;color-scheme:light dark;border:1px solid GrayText;border-radius:5px;max-height:240px;overflow:auto;width:360px;max-width:90vw;font:13px sans-serif";
	let generation = 0,
		frame = 0,
		stopped = false,
		composing = false,
		busy = false,
		index = 0;
	let target: any = null,
		items: any[] = [];
	let side: "above" | "below" | null = null;
	let session: { view: any; from: number; mode: string } | null = null;
	const close = () => {
		generation++;
		target = null;
		items = [];
		session = null;
		side = null;
		panel.remove();
	};
	function position(view: any, pos: number) {
		if (!panel.isConnected) doc.body.append(panel);
		const rect = view.coordsAtPos(pos);
		const below = Math.max(0, win.innerHeight - rect.bottom - 11),
			above = Math.max(0, rect.top - 11);
		side ??= below >= 240 || below >= above ? "below" : "above";
		const space = side === "below" ? below : above;
		panel.style.maxHeight = Math.min(240, space) + "px";
		panel.style.visibility = space < 28 ? "hidden" : "";
		panel.dataset.side = side;
		panel.style.left = Math.max(8, Math.min(rect.left, win.innerWidth - panel.offsetWidth - 8)) + "px";
		panel.style.top = Math.max(8, side === "below" ? rect.bottom + 3 : rect.top - panel.offsetHeight - 3) + "px";
	}
	function message(view: any, pos: number, text: string) {
		panel.replaceChildren();
		const row = doc.createElement("div");
		row.style.padding = "8px";
		row.textContent = text;
		row.setAttribute("role", "status");
		panel.append(row);
		position(view, pos);
	}
	const paint = () =>
		Array.from(panel.children).forEach((row: any, i) => {
			row.setAttribute("aria-selected", String(i === index));
			row.style.background = i === index ? "Highlight" : "";
			row.style.color = i === index ? "HighlightText" : "";
			if (i === index) {
				if (row.offsetTop < panel.scrollTop) panel.scrollTop = row.offsetTop;
				else if (row.offsetTop + row.offsetHeight > panel.scrollTop + panel.clientHeight)
					panel.scrollTop = row.offsetTop + row.offsetHeight - panel.clientHeight;
			}
		});
	async function accept() {
		if (!target || busy) return;
		const saved = target,
			item = items[index],
			ticket = generation;
		busy = true;
		try {
			const text = saved.mode === "annotation" ? await (win as any).__latexSuiteAnnotations(item.id) : item.text;
			const core = getEditorCore(win),
				t = tokenAt(core?.view);
			if (
				stopped ||
				generation !== ticket ||
				core?.view !== saved.view ||
				core.view.state.doc !== saved.doc ||
				!t ||
				t.mode !== saved.mode ||
				t.query !== saved.query ||
				t.from !== saved.from ||
				t.to !== saved.to
			)
				return;
			// Insert literal text, bypassing annotation and Markdown paste transforms.
			core.view.dispatch(core.view.state.tr.insertText(text, t.from, t.to).setMeta("closeHistory$", true));
			core.view.dispatch(core.view.state.tr.setMeta("closeHistory$", true));
			core.view.focus();
			close();
		} catch (error) {
			if (!stopped) win.alert(String(error));
		} finally {
			busy = false;
		}
	}
	async function refresh() {
		frame = 0;
		if (stopped || composing || busy) return;
		const view = getEditorCore(win)?.view;
		if (!view?.dom.contains(doc.activeElement) || doc.activeElement?.closest(".math-node")) {
			close();
			return;
		}
		view.domObserver?.forceFlush?.();
		const token = tokenAt(view);
		if (!token || token.query.trim().length < minimum()) {
			close();
			return;
		}
		if (session && (session.view !== view || session.from !== token.from || session.mode !== token.mode)) close();
		session = { view, from: token.from, mode: token.mode };
		panel.setAttribute("aria-label", token.mode === "annotation" ? "Annotations" : "Word completion");
		const ticket = generation,
			state = view.state;
		try {
			if (token.mode === "annotation" && !panel.isConnected) message(view, token.to, "Loading annotations…");
			const all =
				token.mode === "annotation"
					? JSON.parse(await (win as any).__latexSuiteAnnotations(undefined, token.query, minimum()))
					: sources.match(view.state.doc, token.query, textSettings()).map(a => ({ ...a, id: a.text }));
			if (stopped || ticket !== generation) return;
			const current = tokenAt(view);
			if (state.doc !== view.state.doc || !current || current.from !== token.from || current.to !== token.to) {
				close();
				return;
			}
			const selectedID = items[index]?.id;
			items = all;
			index = Math.max(
				0,
				items.findIndex(item => item.id === selectedID),
			);
			if (!items.length) {
				target = null;
				if (token.mode === "text") close();
				else message(view, token.to, "No matching annotations in this library.");
				return;
			}
			target = { ...token, view, doc: state.doc };
			panel.replaceChildren();
			items.forEach((a, i) => {
				const row = doc.createElement("div");
				row.setAttribute("role", "option");
				row.style.cssText = "padding:7px;white-space:pre-wrap;overflow-wrap:anywhere";
				const content = doc.createElement("div"),
					text = doc.createElement("span"),
					comment = doc.createElement("span"),
					source = doc.createElement("div");
				content.className = "annotation-content";
				content.style.cssText = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
				text.className = "annotation-text";
				text.textContent = a.text ? a.text.slice(0, 240) : "";
				comment.className = "annotation-comment";
				comment.textContent = a.comment ? a.comment.slice(0, 240) : "";
				content.append(text);
				if (a.comment) {
					if (a.text) content.append(doc.createTextNode(" · "));
					content.append(comment);
				}
				row.append(content);
				if (a.source) {
					source.className = "annotation-source";
					source.style.cssText =
						"margin-top:4px;font-size:12px;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
					source.textContent = a.source;
					row.append(source);
				}
				row.addEventListener("mousedown", e => {
					e.preventDefault();
					index = i;
					void accept();
				});
				panel.append(row);
			});
			position(view, token.to);
			paint();
		} catch (error) {
			console.error("Annotation completion:", error);
			if (!stopped && ticket === generation) message(view, token.to, "Annotation search failed: " + String(error));
		}
	}
	const input = () => {
		generation++;
		win.clearTimeout(frame);
		frame = win.setTimeout(() => void refresh(), 120);
	};
	const key = (e: KeyboardEvent) => {
		if (e.key === "Escape" && panel.isConnected) {
			close();
			return;
		}
		if (!target || composing) return;
		if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key) && !e.shiftKey) {
			e.preventDefault();
			e.stopImmediatePropagation();
			if (e.key === "Escape") close();
			else if (e.key === "Enter") void accept();
			else {
				index = (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
				paint();
			}
		} else if (e.key === "Tab" || e.key === "Enter" || e.key.startsWith("Arrow")) close();
	};
	const start = () => {
		composing = true;
		close();
	};
	const end = () => {
		composing = false;
		input();
	};
	const selection = () => {
		if (!session) return;
		const view = getEditorCore(win)?.view,
			token = tokenAt(view);
		if (
			view !== session.view ||
			!token ||
			token.mode !== session.mode ||
			token.from !== session.from ||
			token.query.trim().length < minimum() ||
			(!frame && target && token.to !== target.to)
		)
			close();
	};
	const scroll = (event: Event) => {
		if (!panel.contains(event.target as Node)) close();
	};
	const reset = () => {
		win.clearTimeout(frame);
		frame = 0;
		close();
	};
	doc.addEventListener("latex-suite-settings-changed", reset);
	doc.addEventListener("input", input, true);
	win.addEventListener("keydown", key, true);
	doc.addEventListener("compositionstart", start);
	doc.addEventListener("compositionend", end);
	doc.addEventListener("selectionchange", selection);
	doc.addEventListener("scroll", scroll, true);
	win.addEventListener("resize", close);
	return () => {
		stopped = true;
		close();
		win.clearTimeout(frame);
		doc.removeEventListener("latex-suite-settings-changed", reset);
		doc.removeEventListener("input", input, true);
		win.removeEventListener("keydown", key, true);
		doc.removeEventListener("compositionstart", start);
		doc.removeEventListener("compositionend", end);
		doc.removeEventListener("selectionchange", selection);
		doc.removeEventListener("scroll", scroll, true);
		win.removeEventListener("resize", close);
	};
}
