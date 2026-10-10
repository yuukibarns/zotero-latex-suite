import { renderTikzcd } from "./renderer.mjs";
import rendererCSS from "./renderer.css";

export function isTikzcd(source) {
	// Quiver exports can include a URL comment or optional display delimiters.
	return /^(?:\s|%[^\n]*(?:\n|$))*(?:\\\[(?:\s|%[^\n]*(?:\n|$))*)?\\begin\{tikzcd\}/.test(source);
}

import { installRenderedMath } from "./math-node-renderer.mjs";
export function installMathNodes(doc, { render = renderTikzcd } = {}) {
	return installRenderedMath(doc, { render, matches: isTikzcd, rendererCSS, namespace: "tikzcd" });
}
