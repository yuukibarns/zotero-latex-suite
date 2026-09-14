/* A "bigger window" button on the annotation popup.
 *
 * The in-page popup is 240px wide, which is fine for a sentence and cramped for
 * an equation. This adds a button to its header that blows it up in place —
 * not fullscreen, just big enough to read formulas — and back.
 *
 * Everything here works around the popup being React's: its classes are
 * rewritten on every render (the pointer side is part of `className`), so the
 * state is a data attribute React never sets; and its position is an inline
 * `transform` worked out once from its *small* size, so the enlarged popup
 * ignores it and centres itself over the document instead. The pointer arrow
 * would then point at nothing, so it goes too.
 */
const ATTR = "data-latex-suite-big";
const BUTTON_CLASS = "latex-suite-enlarge";
const STYLE_ID = "latex-suite-popup-enlarge";
const HEADER_END = ".annotation-popup .preview header .end";

const STYLE = `
.annotation-popup[${ATTR}] {
	width: min(720px, calc(100% - 40px));
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%) !important;
}
.annotation-popup[${ATTR}]::before, .annotation-popup[${ATTR}]::after { display: none; }
.annotation-popup[${ATTR}] .comment { font-size: 17px; }
.annotation-popup[${ATTR}] .comment .content { min-height: 40vh; max-height: 75vh; overflow: auto; }
.${BUTTON_CLASS} {
	display: flex; align-items: center; justify-content: center;
	width: 20px; height: 20px; padding: 0; margin-inline-start: 2px;
	border: none; border-radius: 4px; background: none;
	color: var(--fill-secondary); cursor: default;
}
.${BUTTON_CLASS}:hover { background: var(--fill-quinary); }
`;

// Two arrows pointing out / pointing in, as window managers draw them.
const ENLARGE = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 1h4v4M11 1 7 5M5 11H1V7M1 11l4-4"/></svg>`;
const RESTORE = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5H7V1M7 5l4-4M1 7h4v4M5 7l-4 4"/></svg>`;

function update(button: HTMLElement, big: boolean) {
	const label = big ? "Restore popup size" : "Enlarge popup";
	button.innerHTML = big ? RESTORE : ENLARGE;
	button.title = label;
	button.setAttribute("aria-label", label);
	button.setAttribute("aria-pressed", String(big));
}

function addButton(doc: Document, end: Element) {
	if (end.querySelector(`.${BUTTON_CLASS}`)) return;
	const popup = end.closest(".annotation-popup");
	if (!popup) return;

	const button = doc.createElement("button");
	button.className = BUTTON_CLASS;
	button.tabIndex = -1;
	update(button, popup.hasAttribute(ATTR));
	// Keep the caret in the comment: a button that takes focus would end the edit.
	button.addEventListener("mousedown", (event) => event.preventDefault());
	button.addEventListener("click", (event) => {
		event.stopPropagation();
		const big = !popup.hasAttribute(ATTR);
		popup.toggleAttribute(ATTR, big);
		update(button, big);
	});
	// Last, so it sits in the corner, past Zotero's own "…" menu.
	end.appendChild(button);
}

/** Returns a teardown that removes every button and puts every popup back. */
export function installPopupEnlarge(win: any): () => void {
	const doc: Document = win.document;

	if (!doc.getElementById(STYLE_ID)) {
		const style = doc.createElement("style");
		style.id = STYLE_ID;
		style.textContent = STYLE;
		(doc.head ?? doc.documentElement).appendChild(style);
	}

	const scan = () => doc.querySelectorAll(HEADER_END).forEach((end) => addButton(doc, end));
	scan();

	// The popup is created, and its header recreated, whenever an annotation is
	// opened. Almost every mutation in the reader is something else, so only
	// additions are looked at, and only while a popup exists at all.
	const observer = new win.MutationObserver((mutations: MutationRecord[]) => {
		if (!mutations.some((m) => m.addedNodes.length)) return;
		if (doc.querySelector(".annotation-popup")) scan();
	});
	observer.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true });

	return () => {
		observer.disconnect();
		doc.querySelectorAll(`.${BUTTON_CLASS}`).forEach((b) => b.remove());
		doc.querySelectorAll(`[${ATTR}]`).forEach((p) => p.removeAttribute(ATTR));
		doc.getElementById(STYLE_ID)?.remove();
	};
}
