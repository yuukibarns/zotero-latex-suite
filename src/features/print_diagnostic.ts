import { getEditorCore } from "../editor/pm";
import { PRINT_STYLES } from "./print_styles";

/** Self-contained snapshot: no cross-process viewer DOM access. */
export function installPrintDiagnostic(win: Window, getTheme: () => "auto" | "light" | "dark" = () => "auto") {
	const button = win.document.createElement("button");
	button.type = "button";
	button.id = "latex-suite-print-menu-item";
	button.className = "option";
	button.setAttribute("role", "menuitem");
	button.tabIndex = -1;
	button.textContent = "Print / PDF…";
	button.title = "Open rendered note, then File → Print or Ctrl/Cmd+P";
	let stopped = false;
	let busy = false;
	const separator = win.document.createElement("div");
	separator.id = "latex-suite-print-menu-separator";
	separator.className = "separator";
	separator.setAttribute("role", "separator");
	const attach = () => {
		const menu = win.document.querySelector(".more-dropdown .popup");
		if (!menu) return;
		if (separator.parentNode !== menu) menu.append(separator);
		if (button.parentNode !== menu) menu.append(button);
	};
	button.addEventListener("click", async () => {
		if (busy || stopped) return;
		busy = true;
		button.disabled = true;
		button.textContent = "Preparing PDF…";
		try {
			const view = getEditorCore(win)?.view;
			if (!view?.dom) throw new Error("No note editor");
			view.domObserver?.forceFlush?.();
			const source = view.dom as HTMLElement;
			const theme = printTheme(win, source, getTheme());
			const copy = source.cloneNode(true) as HTMLElement;
			const copies = copy.querySelectorAll(".math-node");
			source.querySelectorAll(".math-node").forEach((node, i) => {
				const math = (node as any).pmViewDesc?.spec;
				math?._innerView?.domObserver?.forceFlush?.();
				math?.renderMath?.();
				const rendered = node.querySelector(".math-render");
				if (!rendered || rendered.classList.contains("parse-error") || rendered.querySelector(".katex-error")) throw new Error("Correct invalid equations before printing");
				const replacement = win.document.createElement(node.tagName.toLowerCase() === "math-display" ? "div" : "span");
				if (replacement.tagName.toLowerCase() === "div") replacement.className = "ls-print-display";
				replacement.append(...Array.from(rendered.childNodes, child => child.cloneNode(true)));
				copies[i].replaceWith(replacement);
			});
			const images = source.querySelectorAll<HTMLImageElement>("img");
			copy.querySelectorAll<HTMLImageElement>("img").forEach((image, i) => {
				const live = images[i];
				if (!live.complete || !live.naturalWidth) throw new Error("Wait for note images to load");
				const canvas = win.document.createElement("canvas");
				canvas.width = live.naturalWidth; canvas.height = live.naturalHeight;
				canvas.getContext("2d")!.drawImage(live, 0, 0);
				image.src = canvas.toDataURL("image/png");
				image.removeAttribute("srcset");
			});
			copy.querySelectorAll("script,style,iframe,object,embed,link,meta,base,button,input,textarea,select,#latex-suite-math-preview,#latex-suite-completion").forEach(el => el.remove());
			for (const el of [copy, ...Array.from(copy.querySelectorAll("*"))]) {
				for (const attr of Array.from(el.attributes)) {
					if (/^on/i.test(attr.name) || ["contenteditable", "id", "tabindex"].includes(attr.name)) el.removeAttribute(attr.name);
				}
			}
			const bridge = (win as any).__latexSuiteDiagnosePrint;
			if (!bridge) throw new Error("Diagnostic bridge missing; restart Zotero");
			const css = await embeddedPrintCSS(win);
			if (stopped) return;
			bridge(printDocument(copy.outerHTML, css, theme));
		} catch (error) { if (!stopped) win.alert("PDF snapshot: " + String(error)); }
		finally {
			busy = false;
			button.disabled = false;
			button.textContent = "Print / PDF…";
		}
	});
	const observer = new (win as any).MutationObserver(attach);
	observer.observe(win.document.body, { childList: true, subtree: true });
	attach();
	return () => { stopped = true; observer.disconnect(); button.remove(); separator.remove(); };
}

export async function embeddedPrintCSS(win: Window) {
	const base = "resource://zotero/note-editor/editor.css";
	const response = await win.fetch(base);
	if (!response.ok) throw new Error("Could not load note styles");
	let css = await response.text();
	// KaTeX precedes Zotero's UI styles in the bundled sheet. Fail visibly if
	// that boundary changes rather than silently exporting unstyled equations.
	const end = "body{counter-reset:katexEqnNo mmlEqnNo}";
	const boundary = css.indexOf(end);
	if (boundary < 0) throw new Error("Unsupported Zotero math stylesheet");
	css = css.slice(0, boundary + end.length);
	// Zotero ships WOFF2; the CSS also lists unshipped WOFF/TTF fallbacks.
	css = css.replace(/src:([^;}]+)/g, (rule, sources: string) => {
		const woff2 = sources.match(/url\([^)]*\.woff2\)\s*format\("woff2"\)/);
		return woff2 ? "src:" + woff2[0] : rule;
	});
	const urls = Array.from(new Set(Array.from(css.matchAll(/url\(([^)]+)\)/g), m => m[1])));
	for (const raw of urls) {
		const url = new URL(raw.replace(/^["']|["']$/g, ""), base).href;
		if (url.startsWith("data:")) continue;
		if (!url.startsWith("resource://zotero/note-editor/assets/fonts/")) throw new Error("Unexpected font resource");
		const response = await win.fetch(url);
		if (!response.ok) throw new Error("Could not load math font");
		const blob = await response.blob();
		const data = await new Promise<string>((resolve, reject) => {
			const reader = new (win as any).FileReader() as FileReader;
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(new Error("Could not embed font"));
			reader.readAsDataURL(blob);
		});
		css = css.split("url(" + raw + ")").join("url(" + data + ")");
	}
	return css;
}

export function printTheme(win: Window, source: HTMLElement, preference: unknown = "auto"): "light" | "dark" {
	if (preference === "light" || preference === "dark") return preference;
	// Use the editor's actual background, including Zotero's theme override.
	for (let el: HTMLElement | null = source; el; el = el.parentElement) {
		const color = win.getComputedStyle(el).backgroundColor;
		const channels = color.match(/[\d.]+/g)?.map(Number);
		if (!color.startsWith("rgb") || !channels || channels.length < 3 || (channels[3] !== undefined && channels[3] < 1)) continue;
		return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2] < 128 ? "dark" : "light";
	}
	return win.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function printDocument(html: string, css: string, theme: "light" | "dark" = "light") {
	const override = PRINT_STYLES;
	return `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"><title>Zotero note — Print / PDF</title><style>${css}${override}</style></head><body>${html}</body></html>`;
}
