import { Buffer } from "../editor/buffer";
import { currentBuffer } from "../editor/index";
import { expandCompletion } from "../snippets/snippet_management";
import { candidates, Command, tokenAt, replacementOf } from "./dictionary";

export function installCompletion(win: Window, commands: Command[], minimum: number) {
	const doc = win.document;
	const popup = doc.createElement("div");
	popup.id = "latex-suite-completion";
	popup.setAttribute("role", "listbox");
	popup.setAttribute("aria-label", "LaTeX commands");
	const style = doc.createElement("style");
	style.textContent = `#latex-suite-completion{position:fixed;z-index:2147483647;max-height:224px;overflow:auto;min-width:180px;max-width:calc(100vw - 16px);background:Canvas;color:CanvasText;border:1px solid GrayText;border-radius:5px;box-shadow:0 3px 12px #0003;font:13px monospace;color-scheme:light dark}#latex-suite-completion [role=option]{height:28px;box-sizing:border-box;padding:5px 9px;white-space:pre;overflow:hidden;text-overflow:ellipsis;cursor:pointer}#latex-suite-completion [aria-selected=true]{background:Highlight;color:HighlightText}`;
	doc.head.append(style);
	let frame = 0, stopped = false, composing = false, blocked = false;
	let dismissed = "", owner: object | null = null, key = "", selected = 0;
	let items: Command[] = [];
	let target: Element | null = null;
	const identity = (b: Buffer) => `${b.from}:${b.to}:${b.text}`;
	function close() {
		popup.remove(); items = [];
		if (target) { target.removeAttribute("aria-controls"); target.removeAttribute("aria-activedescendant"); }
		target = null;
	}
	function suppress() { blocked = true; close(); }
	function paint() {
		Array.from(popup.children).forEach((el, i) => el.setAttribute("aria-selected", String(i === selected)));
		target?.setAttribute("aria-activedescendant", `ls-completion-${selected}`);
		const row = popup.children[selected] as HTMLElement;
		if (row) {
			if (row.offsetTop < popup.scrollTop) popup.scrollTop = row.offsetTop;
			else if (row.offsetTop + 28 > popup.scrollTop + 224) popup.scrollTop = row.offsetTop - 196;
		}
	}
	function refresh() {
		frame = 0;
		if (stopped || blocked || composing) return;
		const b = currentBuffer(win), token = b && tokenAt(b, minimum);
		if (!b || !token || !b.caretRect) { close(); owner = null; dismissed = ""; return; }
		const nextKey = identity(b);
		if (owner !== b.owner) dismissed = "";
		if (dismissed === nextKey && owner === b.owner) { close(); return; }
		dismissed = "";
		const next = candidates(commands, token.query);
		if (!next.length) { close(); return; }
		if (owner !== b.owner || key !== nextKey || !items.length) {
			selected = 0; popup.replaceChildren(); popup.scrollTop = 0;
			next.forEach((item, i) => {
				const row = doc.createElement("div"); row.id = `ls-completion-${i}`;
				row.setAttribute("role", "option"); row.textContent = item.displayName;
				row.addEventListener("mousedown", e => { e.preventDefault(); selected = i; accept(); });
				popup.append(row);
			});
		}
		owner = b.owner; key = nextKey; items = next;
		target = doc.activeElement;
		target?.setAttribute("aria-controls", popup.id);
		doc.body.append(popup); paint();
		try {
			const rect = b.caretRect(), height = popup.offsetHeight, width = popup.offsetWidth;
			popup.style.left = `${Math.max(8, Math.min(rect.left, win.innerWidth - width - 8))}px`;
			popup.style.top = `${Math.max(8, rect.bottom + height < win.innerHeight ? rect.bottom + 3 : rect.top - height - 3)}px`;
		} catch { close(); }
	}
	function schedule() { if (!frame && !stopped) frame = win.requestAnimationFrame(refresh); }
	function accept() {
		const b = currentBuffer(win), token = b && tokenAt(b, minimum), item = items[selected];
		if (!b || !token || !item || b.owner !== owner || identity(b) !== key) { close(); return false; }
		suppress();
		expandCompletion(b, token.from, token.to, replacementOf(item.replacement, b.kind === "math_inline"));
		return true;
	}
	function keydown(e: KeyboardEvent) {
		if (composing || e.isComposing || e.keyCode === 229) { close(); return false; }
		if (!items.length) return false;
		if (e.key === "Tab" || (e.key === "Enter" && e.shiftKey)) { suppress(); return false; }
		if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
		if (e.key === "Escape") { dismissed = key; close(); return true; }
		if (e.key === "Enter") return accept();
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			selected = (selected + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
			paint(); return true;
		}
		if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) close();
		return false;
	}
	const input = () => { blocked = false; schedule(); };
	const start = () => { composing = true; close(); };
	const end = () => { composing = false; input(); };
	const blur = () => { close(); };
	const listeners: [EventTarget, string, EventListener, boolean][] = [
		[doc, "input", input, false], [doc, "selectionchange", schedule, false],
		[doc, "compositionstart", start, true], [doc, "compositionend", end, true],
		[doc, "focusout", blur, true], [doc, "scroll", schedule, true], [win, "resize", schedule, false],
	];
	listeners.forEach(([t, e, f, c]) => t.addEventListener(e, f, c));
	return { keydown, suppress, destroy() {
		stopped = true; win.cancelAnimationFrame(frame); close(); style.remove();
		listeners.forEach(([t, e, f, c]) => t.removeEventListener(e, f, c));
	} };
}
