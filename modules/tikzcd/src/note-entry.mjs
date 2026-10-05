import { installMathNodes } from './note-integration.mjs';
if (!window.__tikzcdNotes) {
  const controller = installMathNodes(document);
  window.__tikzcdNotes = {
    dispose() { controller.dispose(); delete window.__tikzcdNotes; },
    get count() { return controller.count; },
  };
}
