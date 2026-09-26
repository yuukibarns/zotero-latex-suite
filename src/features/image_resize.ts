import { getEditorCore } from "../editor/pm";

/** Change the selected image only if the captured document node is still there. */
export function commitImageSize(view: any, pos: number, node: any, width: number, ratio: number) {
	if (view.editable === false || view.state.doc.nodeAt(pos) !== node || node.type.name !== "image"
		|| !Number.isFinite(width) || width < 16 || width > 10000 || !Number.isFinite(ratio) || ratio <= 0) return false;
	width = Math.round(width);
	const height = Math.max(1, Math.round(width / ratio));
	if (node.attrs.width === width && node.attrs.height === height) return true;
	view.dispatch(view.state.tr.setMeta("closeHistory$", true).setNodeMarkup(pos, undefined, { ...node.attrs, width, height }, node.marks));
	view.dispatch(view.state.tr.setMeta("closeHistory$", true));
	return true;
}

/** Overlay stays outside ProseMirror; only pointer-up edits the document. */
export function installImageResize(win: Window) {
	const doc = win.document, view = getEditorCore(win)?.view;
	if (!view?.dom) return () => {};
	const overlay = doc.createElement("div");
	overlay.id = "latex-suite-image-resize";
	overlay.style.cssText = "position:fixed;box-sizing:border-box;border:2px solid #3887ef;z-index:10000;pointer-events:none;display:none";
	const resize = doc.createElement("button");
	resize.type = "button"; resize.textContent = "Resize image…";
	resize.style.cssText = "all:initial;position:absolute;right:0;top:0;padding:5px 8px;background:#2263b4;color:white;font:12px sans-serif;cursor:pointer;pointer-events:auto";
	const handle = doc.createElement("button");
	handle.type = "button"; handle.setAttribute("aria-label", "Drag to resize image; Enter for exact width");
	handle.style.cssText = "all:initial;position:absolute;right:-6px;bottom:-6px;width:12px;height:12px;border:2px solid white;background:#3887ef;cursor:nwse-resize;pointer-events:auto;touch-action:none";
	overlay.append(resize, handle); doc.body.append(overlay);
	let stopped = false, pending = 0;
	let clickedImage: HTMLImageElement | null = null;
	let drag: { pos: number; node: any; ratio: number; startX: number; width: number; next: number; scale: number; pointer: number } | null = null;
	function selected() {
		const { selection } = view.state;
		if (view.editable === false) return null;
		// Resolve against the current document on every use: positions and nodes
		// captured at click time may become stale after an edit or image load.
		if (clickedImage?.isConnected && view.dom.contains(clickedImage)) {
			let target: { pos: number; node: any; img: HTMLImageElement } | null = null;
			view.state.doc.descendants((node: any, pos: number) => {
				if (node.type.name !== "image") return;
				const element = view.nodeDOM(pos);
				if (element === clickedImage || element?.contains(clickedImage)) target = { pos, node, img: clickedImage! };
			});
			if (target && clickedImage.complete && clickedImage.naturalWidth) return target;
		}
		if (selection.node?.type.name !== "image") return null;
		const dom = view.nodeDOM(selection.from) as HTMLElement | null;
		const img = dom?.localName === "img" ? dom as HTMLImageElement : dom?.querySelector("img");
		if (!img?.isConnected || !img.complete || !img.naturalWidth) return null;
		return { pos: selection.from, node: selection.node, img };
	}
	function refresh() {
		pending = 0;
		if (stopped) return;
		const target = selected();
		if (!target || (drag && (target.pos !== drag.pos || target.node !== drag.node))) {
			drag = null; overlay.style.display = "none"; return;
		}
		const rect = target.img.getBoundingClientRect();
		if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= win.innerHeight) { overlay.style.display = "none"; return; }
		overlay.style.display = "block";
		overlay.style.left = rect.left + "px"; overlay.style.top = rect.top + "px";
		overlay.style.width = (drag ? drag.next * drag.scale : rect.width) + "px";
		overlay.style.height = (drag ? drag.next * drag.scale / drag.ratio : rect.height) + "px";
		// Keep actions on the visible portion, even when an image exceeds the
		// editor viewport. The outline still represents the entire image.
		const right = Math.min(win.innerWidth - 10, rect.right);
		resize.style.right = "auto";
		resize.style.left = Math.max(0, right - rect.left - 110) + "px";
		resize.style.top = Math.max(0, 8 - rect.top) + "px";
		handle.style.right = "auto"; handle.style.bottom = "auto";
		handle.style.left = (right - rect.left - 6) + "px";
		handle.style.top = (Math.min(win.innerHeight - 10, rect.bottom) - rect.top - 6) + "px";
	}
	function schedule() { if (!pending && !stopped) pending = win.requestAnimationFrame(refresh); }
	function exact() {
		const target = selected(); if (!target) return;
		const width = Number(win.prompt("Image width in pixels (16–10000):", String(target.node.attrs.width || Math.round(target.img.getBoundingClientRect().width))));
		if (!width) return;
		if (!Number.isFinite(width) || width < 16 || width > 10000) { win.alert("Enter a width between 16 and 10000 pixels."); return; }
		commitImageSize(view, target.pos, target.node, width, target.img.naturalWidth / target.img.naturalHeight);
		view.focus(); schedule();
	}
	resize.addEventListener("click", exact);
	for (const button of [resize, handle]) button.addEventListener("mousedown", e => e.preventDefault());
	handle.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); exact(); } });
	handle.addEventListener("pointerdown", e => {
		if (e.button !== 0) return;
		const target = selected(); if (!target) return;
		const rect = target.img.getBoundingClientRect();
		const scale = rect.width / (target.img.offsetWidth || rect.width);
		const width = rect.width / scale;
		drag = { pos: target.pos, node: target.node, ratio: target.img.naturalWidth / target.img.naturalHeight, startX: e.clientX, width, next: width, scale, pointer: e.pointerId };
		e.preventDefault(); handle.setPointerCapture?.(e.pointerId);
	});
	const move = (e: PointerEvent) => {
		if (!drag || drag.pointer !== e.pointerId) return;
		drag.next = Math.min(10000, Math.max(16, drag.width + (e.clientX - drag.startX) / drag.scale));
		schedule();
	};
	const finish = (e: PointerEvent) => {
		if (!drag || drag.pointer !== e.pointerId) return;
		const state = drag; drag = null;
		if (e.type === "pointerup" && selected()?.node === state.node) commitImageSize(view, state.pos, state.node, state.next, state.ratio);
		schedule();
	};
	const cancel = () => { drag = null; schedule(); };
	const key = (e: KeyboardEvent) => { if (e.key === "Escape" && drag) { e.preventDefault(); cancel(); } else { if (!overlay.contains(e.target as Node)) clickedImage = null; schedule(); } };
	const click = (e: MouseEvent) => {
		const element = e.target as Element;
		if (overlay.contains(element)) return;
		const wrapper = element.closest?.(".regular-image, .external-image");
		const image = element.localName === "img" ? element : wrapper?.querySelector("img");
		clickedImage = image && view.dom.contains(image) ? image as HTMLImageElement : null;
		schedule();
	};
	const loaded = (e: Event) => { if ((e.target as Element)?.localName === "img") schedule(); };
	const observer = new (win as any).MutationObserver(schedule);
	observer.observe(view.dom, { childList: true, subtree: true, attributes: true });
	doc.addEventListener("pointermove", move); doc.addEventListener("pointerup", finish); doc.addEventListener("pointercancel", finish);
	doc.addEventListener("keydown", key, true); doc.addEventListener("click", click, true);
	doc.addEventListener("pointerdown", click, true);
	view.dom.addEventListener("load", loaded, true);
	doc.addEventListener("selectionchange", schedule); doc.addEventListener("scroll", cancel, true);
	win.addEventListener("resize", cancel); win.addEventListener("blur", cancel);
	schedule();
	return () => {
		stopped = true; drag = null; observer.disconnect(); win.cancelAnimationFrame(pending); overlay.remove();
		doc.removeEventListener("pointermove", move); doc.removeEventListener("pointerup", finish); doc.removeEventListener("pointercancel", finish);
		doc.removeEventListener("keydown", key, true); doc.removeEventListener("click", click, true);
		doc.removeEventListener("pointerdown", click, true);
		view.dom.removeEventListener("load", loaded, true);
		doc.removeEventListener("selectionchange", schedule); doc.removeEventListener("scroll", cancel, true);
		win.removeEventListener("resize", cancel); win.removeEventListener("blur", cancel);
	};
}
