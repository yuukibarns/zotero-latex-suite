/** Outer node selections hide native selection painting. Nested editable
 * math must paint its own caret/selection without changing that outer state.
 */
export function installMathVisibility(win: Window): () => void {
	const style = win.document.createElement("style");
	style.id = "latex-suite-math-visibility";
	style.textContent = `
.math-node .math-src .ProseMirror{caret-color:light-dark(#202020,#eeeeee)}
.math-node .math-src .ProseMirror ::selection{background:Highlight;color:HighlightText}
.math-node .math-src .ProseMirror::selection{background:Highlight;color:HighlightText}
.math-node .math-src .ProseMirror ::-moz-selection{background:Highlight;color:HighlightText}
.math-node .math-src .ProseMirror::-moz-selection{background:Highlight;color:HighlightText}
`;
	win.document.head.append(style);
	win.addEventListener("unload", stop);
	function stop() { style.remove();win.removeEventListener("unload", stop); }
	return stop;
}
