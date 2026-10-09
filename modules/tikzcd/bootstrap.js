var stopped = true;
var generation = 0;
var noteScript;
var noteObserver;
var noteDocuments = new Map();

function attachNote(doc) {
  if (stopped || !noteScript || !doc || doc.documentURI.split('?')[0] !== 'resource://zotero/note-editor/editor.html' || noteDocuments.has(doc)) return;
  const win = doc.defaultView;
  if (!win) return;
  function inject() {
    if (stopped || !doc.body) return;
    const script = doc.createElement('script');
    script.textContent = noteScript; doc.documentElement.append(script); script.remove();
  }
  function unload() { noteDocuments.delete(doc); }
  function cleanup() {
    doc.removeEventListener('DOMContentLoaded', inject);
    win.removeEventListener('unload', unload);
    try { win.wrappedJSObject[typeof noteControllerKey === 'string' ? noteControllerKey : '__tikzcdNotes']?.dispose(); } catch (error) { Zotero.debug('TikZ-CD cleanup: ' + error); }
  }
  noteDocuments.set(doc, cleanup);
  win.addEventListener('unload', unload, { once:true });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', inject, { once:true });
  else inject();
}

async function startup({ rootURI }) {
  const revision = ++generation;
  stopped = false;
  await Zotero.initializationPromise;
  await Zotero.uiReadyPromise;
  if (stopped || revision !== generation) return;
  noteScript = await Zotero.File.getResourceAsync(rootURI + 'content/note.js');
  if (stopped || revision !== generation) return;
  // Observe note documents directly; do not stack/replace Zotero.Notes hooks
  // used by other plugins such as LaTeX Suite.
  noteObserver = { observe(doc) { try { attachNote(doc); } catch (error) { Zotero.logError(error); } } };
  Services.obs.addObserver(noteObserver, 'document-element-inserted');
  // Sidebar editors can be preloaded before startup without an EditorInstance.
  // Include existing frame documents, not just notes already opened for editing.
  const visited = new Set();
  function scanWindow(win) {
    try {
      if (!win || visited.has(win.document)) return;
      visited.add(win.document);
      attachNote(win.document);
      for (let i = 0; i < win.frames.length; i++) scanWindow(win.frames[i]);
      for (const frame of win.document.querySelectorAll('iframe, browser')) scanWindow(frame.contentWindow);
    } catch (error) { Zotero.debug('TikZ-CD frame scan: ' + error); }
  }
  for (const win of Services.wm.getEnumerator(null)) scanWindow(win);
  for (const instance of Zotero.Notes._editorInstances || []) attachNote(instance._iframeWindow?.document);
}
function shutdown() {
  stopped = true; generation++;
  if (noteObserver) Services.obs.removeObserver(noteObserver, 'document-element-inserted');
  noteObserver = null;
  for (const cleanup of noteDocuments.values()) cleanup();
  noteDocuments.clear(); noteScript = null;
}
function install() {}
function uninstall() {}
