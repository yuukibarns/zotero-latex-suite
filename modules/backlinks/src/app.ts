import { ResultsPanel } from './panel';
import type { Host, Platform, ReaderMenu } from './types';
export class App {
  private active = false;
  private panel?: ResultsPanel;
  private pending = new Map<number, { host: Host; detach: () => void }>();
  constructor(private platform: Platform) {}
  readonly listener = (event: ReaderMenu): void => {
    if (!this.active) return;
    const keys = [...new Set(event.params.ids || [])];
    if (!keys.length) return;
    const attachmentID = event.reader.itemID;
    event.append({label: 'Find Referencing Notes', onCommand: () => {
      if (!this.active) return;
      const host = this.platform.host();
      if (!host) { this.platform.report(new Error('No Zotero main window is available')); return; }
      // Defer until native reader menu handling has returned.
      const timer = host.defer(() => {
        this.pending.get(timer)?.detach(); this.pending.delete(timer);
        if (!this.active) return;
        try {
          this.panel?.dispose(false);
          this.panel = new ResultsPanel(host, this.platform.source, attachmentID, keys,
            () => { this.panel = undefined; }, e => this.platform.report(e));
        } catch (error) { this.platform.report(error); }
      });
      const detach = host.onClose(() => { host.cancelDeferred(timer); this.pending.delete(timer); detach(); });
      this.pending.set(timer, {host, detach});
    }});
  };
  start(): void {
    if (this.active) return;
    this.platform.register(this.listener); this.active = true;
  }
  stop(): void {
    if (!this.active) return;
    this.active = false; this.platform.unregister(this.listener);
    for (const [id, {host, detach}] of this.pending) { host.cancelDeferred(id); detach(); }
    this.pending.clear(); this.panel?.dispose(false); this.panel = undefined;
  }
}
