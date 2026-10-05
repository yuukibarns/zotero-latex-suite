import katex from 'katex';
import { Parser } from '../build/quiver/parser.mjs';
import { Quiver } from '../build/quiver/quiver.mjs';
import { UI } from '../build/quiver/ui.mjs';
import { Dimensions } from '../build/quiver/ds.mjs';

// Browser-only, render-only adapter. Each render owns its graph, DOM and
// finalization work. No editor, global event handlers, timers or remote assets.
class Layout extends UI {
  constructor(root) {
    super();
    this.root = root;
    this.quiver = new Quiver();
    this.default_cell_size = 128;
    this.cell_width = new Map();
    this.cell_height = new Map();
    this.present = 0;
    this.diagnostics = [];
    this.panel = { render_maths: (_ui, cell) => this.renderLabel(cell) };
  }
  add_cell(cell) { this.root.append(cell.element.element); }
  remove_cell(cell) {
    for (const removed of this.quiver.remove(cell, 0)) removed.element.element.remove();
  }
  update_cell_size() {
    // Dimensions are collected together after fonts load, never during parse.
  }
  renderLabel(cell) {
    const label = cell.element.query_selector('.label');
    if (!label) return;
    katex.render(cell.label.replace(/\$/g, '\\$'), label.element, {
      throwOnError: false, trust: false, strict: 'warn',
      maxExpand: 500, maxSize: 20, macros: {}, errorColor: '#b42318',
    });
    if (label.element.querySelector('.katex-error')) {
      this.diagnostics.push({ severity: 'warning', message: `Invalid label: ${cell.label}` });
    }
  }
  layout() {
    const cells = this.quiver.all_cells();
    // Preserve Quiver's minimum spacing between cells.
    for (const cell of cells.filter(c => c.is_vertex())) {
      const label = cell.element.query_selector('.label').element;
      this.cell_width.set(cell.position.x, Math.max(this.cell_size(this.cell_width, cell.position.x), label.offsetWidth + 64));
      this.cell_height.set(cell.position.y, Math.max(this.cell_size(this.cell_height, cell.position.y), label.offsetHeight + 64));
    }
    this.quiver.rerender(this);
    for (const cell of cells.filter(c => c.is_edge())) {
      const label = cell.element.query_selector('.label')?.element;
      if (label) cell.arrow.label.size = new Dimensions(
        label.offsetWidth + (label.offsetWidth ? 16 : 0),
        label.offsetHeight + (label.offsetHeight ? 16 : 0));
    }
    this.quiver.rerender(this);
  }
}

function diagnosticText(message) {
  return (Array.isArray(message) ? message : [message])
    .map(part => typeof part === 'string' ? part : part.element?.textContent || '')
    .join('');
}

/** Render into a connected, visible-layout container in this document.
 * Cancelling rejects with AbortError and removes only this invocation's root.
 * Caller owns replacing any previous successful render.
 */
export async function renderTikzcd(container, source, { signal } = {}) {
  if (typeof source !== 'string' || source.length > 20000) throw new Error('Source must be at most 20,000 characters.');
  if (!container.isConnected || container.ownerDocument !== document) throw new Error('Renderer requires a connected container in its document.');
  const check = () => {
    if (signal?.aborted || !container.isConnected) throw new DOMException('Render cancelled', 'AbortError');
  };
  check();
  const root = document.createElement('div');
  root.className = 'tikzcd-diagram';
  root.style.visibility = 'hidden';
  const graph = document.createElement('div');
  graph.className = 'tikzcd-graph';
  root.append(graph); container.append(root);
  try {
    const ui = new Layout(graph);
    const parser = new Parser(ui, source.trim());
    parser.parse_diagram();
    if (parser.diagnostics.some(d => d instanceof Parser.Error)) {
      throw new Error(parser.diagnostics.map(d => diagnosticText(d.message)).join('\n'));
    }
    // KaTeX has synchronously created labels; font metrics must settle first.
    // Cancellation can interrupt a pending font load without leaking a listener.
    await waitForFonts(signal);
    check();
    ui.layout();
    parser.post_layout();
    ui.quiver.rerender(ui);
    // SVG canvases include large rotation/curve safety boxes. Measure painted
    // geometry instead, excluding mask/clip definitions and hidden hit targets.
    const measurable = [...graph.querySelectorAll('.label, .arrow > svg path, .arrow > svg circle, .arrow > svg polygon, .arrow > svg line')]
      .filter(n => !n.closest('defs, mask, clipPath, .arrow-background, .arrow-endpoint, .invalid'));
    const origin = graph.getBoundingClientRect();
    const rects = [...measurable].map(n => n.getBoundingClientRect()).filter(r => r.width || r.height);
    // Fit actual content, not the grid origin (which adds an empty half-cell).
    const left = rects.length ? Math.min(...rects.map(r => r.left - origin.left)) : 0;
    const top = rects.length ? Math.min(...rects.map(r => r.top - origin.top)) : 0;
    const right = rects.length ? Math.max(...rects.map(r => r.right - origin.left)) : 0;
    const bottom = rects.length ? Math.max(...rects.map(r => r.bottom - origin.top)) : 0;
    // Quiver lays out in fixed 26px units. Scale the complete graph to the
    // surrounding math node, rather than shrinking labels alone.
    const inheritedSize = parseFloat(window.getComputedStyle(container).fontSize);
    const scale = Number.isFinite(inheritedSize) && inheritedSize > 0 ? inheritedSize / 26 : 1;
    const width = Math.ceil((right - left) * scale), height = Math.ceil((bottom - top) * scale);
    if (width > 16000 || height > 16000) throw new Error('Diagram dimensions exceed 16,000 pixels.');
    graph.style.transformOrigin = '0 0';
    graph.style.transform = `scale(${scale}) translate(${-left}px, ${-top}px)`;
    root.style.width = `${width}px`; root.style.height = `${height}px`;
    root.style.visibility = '';
    const diagnostics = [...ui.diagnostics, ...parser.diagnostics.map(d => ({
      severity: d instanceof Parser.Error ? 'error' : 'warning',
      message: diagnosticText(d.message),
    }))];
    return { element: root, diagnostics, width, height,
      vertices: ui.quiver.all_cells().filter(c => c.is_vertex()).length,
      edges: ui.quiver.all_cells().filter(c => c.is_edge()).length,
      dispose: () => root.remove() };
  } catch (error) { root.remove(); throw error; }
}

function waitForFonts(signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException('Render cancelled', 'AbortError')); };
    const cleanup = () => signal?.removeEventListener('abort', abort);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    Promise.resolve(document.fonts?.ready).then(() => { cleanup(); resolve(); }, e => { cleanup(); reject(e); });
  });
}
