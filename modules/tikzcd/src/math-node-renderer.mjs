/** A view-only integration with Zotero 10's MathView. Never edits a PM document
 * or replaces source DOM; native open/close, selection, undo and saving remain
 * Zotero's responsibility. Private API checks fail closed on unknown versions.
 */
export function installRenderedMath(doc, { render, matches, rendererCSS, namespace, label = 'diagram', align = 'center', inheritEditorFont = false }) {
  const marginInline = align === 'left' ? '0 auto' : 'auto';
  const win = doc.defaultView;
  const states = new Map();
  let stopped = false;
  const style = doc.createElement('style');
  style.setAttribute(`data-${namespace}-style`, '');
  style.textContent = rendererCSS + `
math-display[data-${namespace}] > .math-render { cursor:pointer; }
.${namespace}-note-surface { display:block; width:100%; overflow:auto; text-align:center; background:transparent; color:inherit; margin:0; }
.${namespace}-note-output { display:block; margin:0; padding:0; }
.${namespace}-note-output > .${namespace}-diagram { display:block; margin-inline:${marginInline}; }
.${namespace}-note-status { display:block; text-align:left; font:12px/1.5 system-ui,sans-serif; padding:0; margin:0; color:inherit; white-space:pre-wrap; }
.${namespace}-note-status:empty { display:none; }
/* Do not expose a stale clone through an optional generic equation preview. */
math-display[data-${namespace}] #latex-suite-math-preview:not([data-external-renderer]) { display:none!important; }
`;
  doc.head.append(style);
  const exports = new Set();
  function exportMath(event) {
    const request = event.detail;
    const text = request?.math?._innerView?.state.doc.textContent ?? request?.math?._node?.textContent;
    if (stopped || request?.node?.localName !== 'math-display' || typeof text !== 'string' || !matches(text)) return;
    request.css = rendererCSS;
    request.rendered = (async () => {
      const host = doc.createElement('div');
      host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden';
      // Typography belongs to the exporter. Older exporters fall back to the
      // source node's computed size, never a second hardcoded print size.
      host.style.fontSize = request.fontSize || win.getComputedStyle(request.node).fontSize;
      doc.body.append(host);
      const controller = new win.AbortController(); exports.add(controller);
      let result;
      try {
        result = await render(host, text, { signal:controller.signal });
        const errors = result.diagnostics.filter(d=>d.severity === 'error');
        if (errors.length) throw new Error(errors.map(d=>d.message).join('\n'));
        const warnings = result.diagnostics.filter(d=>d.severity !== 'error').map(d=>d.message);
        if (Array.isArray(request.warnings)) request.warnings.push(...warnings);
        const copy = result.element.cloneNode(true);
        copy.style.display = 'block'; copy.style.marginInline = marginInline;
        return copy;
      } finally { result?.dispose(); host.remove(); exports.delete(controller); }
    })();
  }
  doc.addEventListener('latex-suite-export-math', exportMath);
  const previewRequest = event => states.get(event.detail?.math)?.preview(event.detail);
  const previewRelease = event => states.get(event.detail?.math)?.closePreview();
  doc.addEventListener('latex-suite-preview-request', previewRequest);
  doc.addEventListener('latex-suite-preview-release', previewRelease);

  function attach(node) {
    const math = node.pmViewDesc?.spec;
    if (!math || states.has(math) || math.dom !== node || node.localName !== 'math-display' ||
      math._mathRenderElt?.ownerDocument !== doc || math._mathSrcElt?.ownerDocument !== doc ||
      typeof math._node?.textContent !== 'string' || !math._outerView ||
      !['renderMath','update','openEditor','closeEditor','destroy'].every(k => typeof math[k] === 'function')) return;
    let alive = true, surface = null, output = null, status = null;
    let previewTarget = null, previewDelay = 100;
    function preview(request) {
      if (!alive || !math._innerView || !matches(source())) return;
      request.handled = true;
      previewTarget = request.output;
      previewDelay = Number.isFinite(request.debounceMs) ? Math.max(0, Math.min(2000, request.debounceMs)) : 100;
      refresh(true);
    }
    function closePreview() {
      previewTarget = null; cancel();
      if (surface) mount();
      if (!math._innerView) refresh();
    }
    let timer = null, controller = null, current = null, requested = null, revision = 0;
    const hooks = [];
    const source = () => math._innerView?.state.doc.textContent ?? math._node.textContent;
    const originalRender = math.renderMath;
    function cancel() {
      revision++;
      if (timer !== null) win.clearTimeout(timer);
      timer = null; controller?.abort(); controller = null; requested = null;
    }
    function clear() {
      cancel(); current?.dispose(); current = null;
      surface?.remove(); surface = output = status = null;
      node.removeAttribute(`data-${namespace}`);
    }
    function mount() {
      node.setAttribute(`data-${namespace}`, '');
      node.classList.remove('empty-math');
      math._mathRenderElt.classList.remove('parse-error');
      node.removeAttribute('title');
      if (!surface) {
        surface = doc.createElement('div'); surface.className = `${namespace}-note-surface`;
        surface.contentEditable = 'false';
        output = doc.createElement('div'); output.className = `${namespace}-note-output`;
        status = doc.createElement('div'); status.className = `${namespace}-note-status`;
        status.setAttribute('role', 'status');
        surface.append(output, status);
      }
      const parent = math._innerView && previewTarget ? previewTarget : math._mathRenderElt;
      if (inheritEditorFont) surface.style.fontSize = win.getComputedStyle(node.closest('.ProseMirror') || node).fontSize;
      if (surface.parentNode !== parent) {
        parent.replaceChildren(surface);
      }
    }
    function refresh(fromPreview = false) {
      if (!alive || stopped) return false;
      const text = source();
      if (!matches(text)) {
        const wasDiagram = !!surface;
        clear();
        if (wasDiagram) originalRender.call(math);
        return false;
      }
      // While editing, only the shared preview may request rendering. This
      // preserves its enabled/disabled, debounce and IME behavior.
      if (math._innerView && (!previewTarget || !fromPreview)) {
        node.setAttribute(`data-${namespace}`, '');
        if (!previewTarget && (timer !== null || controller)) cancel();
        return true;
      }
      mount();
      if (requested === text) return true;
      cancel(); requested = text;
      const ticket = revision;
      status.textContent = '';
      timer = win.setTimeout(async () => {
        timer = null;
        if (!alive || stopped || !node.isConnected || ticket !== revision) return;
        const job = new win.AbortController(); controller = job;
        try {
          const result = await render(output, text, { signal: job.signal });
          if (!alive || stopped || !node.isConnected || ticket !== revision || source() !== text) {
            result.dispose(); return;
          }
          current?.dispose(); current = result;
          status.textContent = result.diagnostics.map(d => d.message).join('\n');
          output.dataset.source = text;
        } catch (error) {
          if (ticket === revision && alive && !stopped && error.name !== 'AbortError') {
            status.textContent = (current ? `Showing previous ${label}. ` : '') + `Cannot render: ${error.message}`;
          }
        } finally { if (controller === job) controller = null; }
      }, math._innerView ? previewDelay : 0);
      return true;
    }
    function hook(name, after) {
      const own = Object.getOwnPropertyDescriptor(math, name), previous = math[name];
      function wrapped(...args) {
        // Other plugins use renderMath with a detached facade. Never attach
        // state or a Quiver render to those temporary objects.
        if (this !== math || !alive || stopped) return previous.apply(this, args);
        if (name === 'renderMath' && refresh()) return;
        if (name === 'destroy') release(false);
        const result = previous.apply(this, args);
        if (after && alive) refresh();
        return result;
      }
      math[name] = wrapped;
      hooks.push(() => {
        if (math[name] === wrapped) {
          if (own) Object.defineProperty(math, name, own); else delete math[name];
        }
      });
    }
    function release(restoreNative) {
      if (!alive) return;
      alive = false;
      const wasDiagram = !!surface;
      clear();
      for (const unhook of hooks.reverse()) unhook();
      states.delete(math);
      if (restoreNative && wasDiagram && node.isConnected && math._mathRenderElt) originalRender.call(math);
    }
    hook('renderMath', false);
    hook('update', true);
    hook('openEditor', true);
    hook('closeEditor', true);
    hook('destroy', false);
    states.set(math, { node, release, preview, closePreview });
    refresh();
  }
  const scan = root => {
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.matches?.('math-display')) attach(root);
    root.querySelectorAll('math-display').forEach(attach);
  };
  const observer = new win.MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType === 1 && !node.closest(`.${namespace}-note-surface`)) scan(node);
    }
    for (const state of states.values()) if (!state.node.isConnected) state.release(false);
  });
  observer.observe(doc.body, { childList:true, subtree:true });
  scan(doc);
  function dispose() {
    if (stopped) return;
    stopped = true; observer.disconnect();
    doc.removeEventListener('latex-suite-export-math', exportMath);
    doc.removeEventListener('latex-suite-preview-request', previewRequest);
    doc.removeEventListener('latex-suite-preview-release', previewRelease);
    for (const controller of exports) controller.abort();
    for (const state of [...states.values()]) state.release(true);
    style.remove(); win.removeEventListener('unload', dispose);
  }
  win.addEventListener('unload', dispose, { once:true });
  return { dispose, get count() { return states.size; } };
}
