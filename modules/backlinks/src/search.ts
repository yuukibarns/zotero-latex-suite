import { matchEvidence } from './matcher';
import type { Match, Progress, SearchSource } from './types';
export class Cancelled extends Error { constructor() { super('Search cancelled'); } }
export class Cancellation {
  cancelled = false;
  cancel(): void { this.cancelled = true; }
  check(): void { if (this.cancelled) throw new Cancelled(); }
}
export const BATCH_SIZE = 100;
export async function search(source: SearchSource, attachmentID: number, keys: string[], token: Cancellation,
  progress: (p: Progress) => void = () => {}): Promise<Match[]> {
  token.check();
  const target = await source.target(attachmentID, [...new Set(keys)]);
  token.check();
  if (!target.annotationKeys.size) return [];
  const ceiling = await source.ceiling();
  token.check();
  const results: Match[] = [];
  let after = 0, scanned = 0;
  while (after < ceiling) {
    token.check();
    const rows = await source.rows(after, ceiling, BATCH_SIZE);
    token.check();
    if (!rows.length) break;
    if (rows.length > BATCH_SIZE || rows.some((r, i) => r.id <= (i ? rows[i - 1].id : after) || r.id > ceiling)) {
      throw new Error('Invalid note batch returned by Zotero');
    }
    for (const row of rows) {
      token.check();
      const evidence = matchEvidence(source.parse(row.html), target, source.resolver);
      if (evidence.annotationKeys.length || evidence.possibleAnnotationKeys.length) {
        const note = await source.note(row.id);
        token.check();
        if (note) results.push({...note, ...evidence});
      }
      scanned++;
    }
    after = rows[rows.length - 1].id;
    progress({scanned, matched: results.length});
    // Always yield, including batches with no matches.
    await source.yield();
    token.check();
  }
  return results.sort((a, b) => Number(!a.annotationKeys.length) - Number(!b.annotationKeys.length) || a.title.localeCompare(b.title) || a.id - b.id);
}
export class SearchCoordinator {
  private current?: Cancellation;
  cancel(): void { this.current?.cancel(); this.current = undefined; }
  async run(source: SearchSource, id: number, keys: string[], progress: (p: Progress) => void,
    complete: (matches: Match[]) => void, failed: (error: unknown) => void): Promise<void> {
    this.cancel();
    const token = this.current = new Cancellation();
    try {
      const matches = await search(source, id, keys, token, p => { if (this.current === token) progress(p); });
      if (this.current === token && !token.cancelled) complete(matches);
    } catch (error) {
      if (!(error instanceof Cancelled) && this.current === token) failed(error);
    } finally { if (this.current === token) this.current = undefined; }
  }
}
