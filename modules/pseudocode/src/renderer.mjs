import Lexer from '../vendor/src/Lexer.js';
import Parser from '../vendor/src/Parser.js';
import Renderer from '../vendor/src/Renderer.js';
import katex from 'katex-zotero';
import css from '../vendor/static/pseudocode.css';

// Reuse the note/exporter's local KaTeX fonts; never fetch CDN styles.
export const rendererCSS = css.replace(/^@import[^;]+;\s*/m, '') + `
.pseudocode-diagram { box-sizing:border-box; font-size:1em; text-align:left; white-space:normal; width:100%; max-width:100%; color:inherit; background:transparent; }
.pseudocode-diagram .ps-algorithm { margin:0; border-top:1px solid; border-bottom:1px solid; padding:0.25em 0; }
/* Upstream applies a hanging indent to captions as well as preconditions.
 * Reset just the caption; retain indentation and numbering inside the body. */
.pseudocode-diagram .ps-algorithm.with-caption > .ps-line:first-child { text-indent:0!important; padding:0.15em 0.6em 0.35em!important; border-bottom:1px solid; }
.pseudocode-diagram .ps-algorithmic { padding:0.35em 0.6em; }
.pseudocode-diagram .ps-line { line-height:1.45; }
`;
export const isPseudocode = source => /^\s*\\begin\{(?:algorithm|algorithmic)\}/.test(source);

export async function renderPseudocode(container, source, { signal } = {}) {
  signal?.throwIfAborted();
  if (source.length > 20000 || (source.match(/\\[a-zA-Z]+|[{}]/g) || []).length > 1000)
    throw new Error('Algorithm is too large (20,000 characters / 1,000 commands and braces maximum).');
  const renderer = new Renderer(new Parser(new Lexer(source)), { lineNumber:true, captionCount:0 });
  renderer.backend = { name:'katex', driver:{ renderToString(text) {
    return katex.renderToString(text, { trust:false, maxExpand:500, maxSize:20, macros:{} });
  } } };
  const element = container.ownerDocument.createElement('div');
  element.className = 'pseudocode-diagram';
  element.innerHTML = renderer.toMarkup();
  signal?.throwIfAborted();
  container.append(element);
  return { element, diagnostics:[], dispose() { element.remove(); } };
}
