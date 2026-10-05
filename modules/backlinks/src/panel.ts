import type { Host, Match, SearchSource } from './types';
import { SearchCoordinator } from './search';
export const PAGE_SIZE = 50;
export class ResultsPanel {
  readonly root: HTMLElement;
  private coordinator = new SearchCoordinator();
  private disposed = false;
  private detachClose: () => void = () => {};
  private cleanup: (() => void)[] = [];
  private priorFocus: Element | null;
  private matches: Match[] = [];
  private page = 0;
  private filter: HTMLInputElement;
  private status: HTMLElement;
  private list: HTMLElement;
  private pagination: HTMLElement;
  private previous: HTMLButtonElement;
  private next: HTMLButtonElement;
  private refresh: HTMLButtonElement;
  private refreshing = false;
  private popup?: ReturnType<Host['createPopup']>;
  private pageBar: HTMLElement;
  constructor(private host: Host, private source: SearchSource, private attachmentID: number,
    private keys: string[], private closed: () => void, private report: (e: unknown) => void) {
    this.priorFocus = host.document.activeElement;
    this.root = this.el('section');
    this.root.id = 'annotation-backlinks-results';
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', 'Referencing notes');
    this.root.style.cssText = 'display:flex;flex-direction:column;box-sizing:border-box;width:min(390px,calc(100vw - 32px));max-height:min(350px,calc(100vh - 100px));padding:8px;gap:6px;color:inherit;font:inherit;';
    const title = this.el('strong', 'Referencing notes');
    this.status = this.el('p', 'Searching saved notes…'); this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.filter = this.el('input') as HTMLInputElement;
    this.filter.type = 'search'; this.filter.placeholder = 'Filter by note, source, or library';
    this.filter.setAttribute('aria-label', 'Filter referencing notes');
    this.filter.style.cssText = 'box-sizing:border-box;width:100%;min-height:24px';
    this.list = this.el('div'); this.list.id = 'annotation-backlinks-list';
    this.list.style.cssText = 'overflow:auto;min-height:0;flex:1';
    this.status.style.cssText = 'margin:0;font-size:0.9em';
    this.pagination = this.el('span');
    this.previous = this.button('Previous', () => { this.page--; this.render(); });
    this.next = this.button('Next', () => { this.page++; this.render(); });
    this.refresh = this.button('Refresh', () => this.start());
    const toolbar = this.el('div'); toolbar.style.cssText = 'display:flex;align-items:center;gap:6px';
    title.style.flex = '1';
    toolbar.append(title, this.refresh, this.button('Close', () => this.dispose()));
    this.pageBar = this.el('div');
    this.pageBar.append(this.previous, this.pagination, this.next); this.pageBar.hidden = true;
    this.root.append(toolbar, this.filter, this.status, this.list, this.pageBar);
    this.listen(this.filter, 'input', () => { this.page = 0; this.render(); });
    this.listen(this.root, 'keydown', event => {
      if ((event as KeyboardEvent).key === 'Escape') { event.stopPropagation(); this.dispose(); }
    });
    try {
      this.popup = host.createPopup(this.root, () => this.dispose(false), () => this.filter.focus());
      this.detachClose = host.onClose(() => this.dispose(false));
      host.focus(); this.popup.show();
      this.start();
    } catch (error) { this.dispose(false); throw error; }
  }
  private el(tag: string, text = ''): HTMLElement {
    const node = this.host.document.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement;
    node.textContent = text; return node;
  }
  private listen(node: HTMLElement, type: string, listener: (e: Event) => void): void {
    node.addEventListener(type, listener); this.cleanup.push(() => node.removeEventListener(type, listener));
  }
  private button(text: string, action: () => void | Promise<void>): HTMLButtonElement {
    const b = this.el('button', text) as HTMLButtonElement;
    b.type = 'button';
    // Buttons in result pages are discarded with their DOM nodes, not retained in cleanup.
    b.addEventListener('click', () => {
      if (this.disposed) return;
      try { Promise.resolve(action()).catch(e => this.fail(e)); } catch (e) { this.fail(e); }
    }); return b;
  }
  private fail(error: unknown): void {
    if (this.disposed) return;
    this.status.textContent = `Unable to complete action: ${error instanceof Error ? error.message : String(error)}`;
    this.report(error);
  }
  start(): void {
    if (this.disposed) return;
    this.refreshing = true; this.refresh.disabled = true;
    this.status.textContent = 'Searching saved notes…';
    void this.coordinator.run(this.source, this.attachmentID, this.keys,
      p => { this.status.textContent = `Searched ${p.scanned} notes · ${p.matched} matches`; },
      matches => { this.refreshing = false; this.refresh.disabled = false; this.matches = matches; this.page = 0; this.render(); },
      error => { this.refreshing = false; this.refresh.disabled = false; this.fail(error); });
  }
  private render(): void {
    if (this.disposed) return;
    const query = this.filter.value.toLocaleLowerCase();
    const visible = this.matches.filter(m => `${m.title} ${m.parent} ${m.library}`.toLocaleLowerCase().includes(query));
    const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    this.page = Math.max(0, Math.min(pages - 1, this.page));
    if (!this.refreshing) this.status.textContent = `${visible.length} of ${this.matches.length} referencing notes · ${this.keys.length} selected annotation(s)`;
    this.previous.disabled = this.page === 0; this.next.disabled = this.page >= pages - 1;
    this.pageBar.hidden = pages <= 1;
    this.pagination.textContent = ` Page ${this.page + 1} of ${pages} `;
    this.list.replaceChildren();
    if (!visible.length) this.list.append(this.el('p', this.matches.length ? 'No notes match this filter.' : 'No saved notes reference the selected annotation(s).'));
    for (const match of visible.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE)) {
      const card = this.el('article');
      const row = this.button('', async () => { await this.host.openNote(match.id); this.dispose(false); });
      row.style.cssText = 'display:block;width:100%;text-align:start;margin:0;padding:5px 6px;';
      row.setAttribute('aria-label', `Open note: ${match.title}`);
      const heading = this.el('span', match.title);
      heading.style.cssText = 'display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      const detail = this.el('small', `${match.library} · ${match.parent}`);
      detail.style.cssText = 'display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:0.75';
      row.title = `${match.title}\n${match.library} · ${match.parent}`;
      row.append(heading, detail);
      if (match.possibleAnnotationKeys?.length) {
        const label = match.annotationKeys.length ? 'Exact backlink + possible match' : 'Possible match';
        const evidence = this.el('small', label); evidence.style.display = 'block';
        evidence.title = 'Same source, page, and nearby comment text; the note has no matching annotation identifier.';
        row.append(evidence); row.setAttribute('aria-label', `Open note: ${match.title} (${label})`);
      }
      card.append(row);
      this.list.append(card);
    }
  }
  dispose(restoreFocus = true): void {
    if (this.disposed) return;
    this.disposed = true; this.coordinator.cancel(); this.detachClose();
    this.cleanup.forEach(fn => fn()); this.cleanup = [];
    this.popup?.destroy(); this.root.remove(); this.matches = [];
    if (restoreFocus && this.priorFocus?.isConnected && 'focus' in this.priorFocus) (this.priorFocus as HTMLElement).focus();
    this.priorFocus = null; this.closed();
  }
}
