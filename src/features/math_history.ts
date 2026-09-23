import { getActiveMathView } from "../editor/pm";

/** Equation edits belong to the outer note's history, not its nested editor. */
export function handleMathHistory(win: Window, event: KeyboardEvent): boolean {
	if (event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey === event.metaKey) return false;
	const key = event.key.toLowerCase();
	if (key !== "z" && !(key === "y" && event.ctrlKey && !event.shiftKey)) return false;
	if (!getActiveMathView(win.document)) return false;
	const redo = key === "y" || event.shiftKey;
	// Zotero exposes these entry points for its own editor chrome.
	const command = (win as any)[redo ? "doRedo" : "doUndo"];
	if (typeof command !== "function") return false;
	command.call(win);
	// Even an empty history must not fall through to contenteditable's history.
	return true;
}
