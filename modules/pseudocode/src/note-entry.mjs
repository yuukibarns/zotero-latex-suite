import { installRenderedMath } from '../../tikzcd/src/math-node-renderer.mjs';
import { renderPseudocode, isPseudocode, rendererCSS } from './renderer.mjs';
if (!window.__pseudocodeNotes) {
  const controller = installRenderedMath(document, { render:renderPseudocode, matches:isPseudocode, rendererCSS, namespace:'pseudocode', label:'algorithm', align:'left' });
  window.__pseudocodeNotes = { dispose() { controller.dispose(); delete window.__pseudocodeNotes; } };
}
