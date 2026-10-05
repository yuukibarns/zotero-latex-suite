import type { CitationHint, Host, Identity, NoteInfo, NoteRow, Platform, ReaderMenu, SearchSource } from './types';
export interface ZoteroItem {
 id: number; key: string; libraryID: number; parentID: number | false; deleted: boolean;
 annotationType?: string; annotationComment?: string; annotationPageLabel?: string;
 isAttachment(): boolean; isNote(): boolean; isAnnotation(): boolean;
 getField(field: string): string; getNoteTitle(): string;
}
export interface ZoteroWindow extends Window {
 DOMParser: typeof DOMParser;
 KeyboardEvent: typeof KeyboardEvent;
 ZoteroPane: { openNote(id: number): Promise<unknown> };
}
export interface ZoteroAPI {
 Reader: {registerEventListener(type: string, fn: (e: ReaderMenu) => void, id: string): void;
 unregisterEventListener(type: string, fn: (e: ReaderMenu) => void): void};
 DB: {queryAsync<T>(sql: string, params?: (number | string)[]): Promise<T[]>};
 Items: { getAsync(id: number): Promise<ZoteroItem | false>; exists(id: number): boolean; getByLibraryAndKey(libraryID: number, key: string): ZoteroItem | false };
 URI: {getURIItemLibraryKey(uri: string): Identity | false};
 Libraries: {userLibraryID: number; get(id: number): {name: string} | false};
 Groups: {getLibraryIDFromGroupID(id: number): number | false};
 Promise: {delay(ms: number): Promise<void>};
 getMainWindow(): ZoteroWindow | null;
 logError(e: unknown): void;
}
export const LIVE_NOTES = `FROM itemNotes n
 WHERE NOT EXISTS (SELECT 1 FROM deletedItems d WHERE d.itemID=n.itemID)
 AND NOT EXISTS (SELECT 1 FROM deletedItems d WHERE d.itemID=n.parentItemID)`;
export const BATCH_SQL = `SELECT n.itemID AS id, n.note AS html ${LIVE_NOTES}
 AND n.itemID > ? AND n.itemID <= ? AND (n.note LIKE ? OR n.note LIKE ? OR n.note LIKE ?)
 ORDER BY n.itemID LIMIT ?`;
export function createPlatform(z: ZoteroAPI, pluginID: string): Platform {
  const liveNote = async (id: number): Promise<boolean> => (await z.DB.queryAsync<{id: number}>(
    `SELECT n.itemID AS id ${LIVE_NOTES} AND n.itemID=?`, [id])).length > 0;
  const source: SearchSource = {
    async target(id, keys) {
      if (!z.Items.exists(id)) throw new Error('The source attachment is no longer available.');
      const item = await z.Items.getAsync(id);
      if (!item || item.deleted || !item.isAttachment()) throw new Error('The source attachment is no longer available.');
      const citationHints: CitationHint[] = [];
      if (item.parentID) {
        const parent = await z.Items.getAsync(item.parentID);
        if (!parent || parent.deleted) throw new Error('The source item is in the trash.');
        for (const key of keys) {
          const annotation = z.Items.getByLibraryAndKey(item.libraryID, key);
          if (!annotation || annotation.deleted || !annotation.isAnnotation() || annotation.parentID !== item.id
            || !['text', 'note'].includes(annotation.annotationType || '')
            || !annotation.annotationPageLabel?.trim() || !annotation.annotationComment?.trim()) continue;
          citationHints.push({annotationKey: key, source: {libraryID: parent.libraryID, key: parent.key},
            page: annotation.annotationPageLabel, comment: source.parse(annotation.annotationComment).body.textContent || ''});
        }
      }
      return {attachment: {libraryID: item.libraryID, key: item.key}, annotationKeys: new Set(keys), citationHints};
    },
    async ceiling() {
      const rows = await z.DB.queryAsync<{ceiling: number | null}>('SELECT MAX(itemID) AS ceiling FROM itemNotes');
      return rows[0]?.ceiling || 0;
    },
    rows(after, ceiling, limit) { return z.DB.queryAsync<NoteRow>(BATCH_SQL, [after, ceiling, '%data-annotation%', '%zotero:%', '%data-citation%', limit]); },
    async note(id): Promise<NoteInfo | null> {
      if (!await liveNote(id) || !z.Items.exists(id)) return null;
      const note = await z.Items.getAsync(id);
      if (!note || note.deleted || !note.isNote()) return null;
      const parent = note.parentID ? await z.Items.getAsync(note.parentID) : false;
      if (parent && parent.deleted) return null;
      const library = z.Libraries.get(note.libraryID);
      return {id, title: note.getNoteTitle() || 'Untitled note',
        parent: parent ? parent.getField('title') : 'Standalone note', library: library ? library.name : 'Unavailable library'};
    },
    parse(html) {
      const win = z.getMainWindow();
      if (!win || win.closed) throw new Error('The Zotero window was closed.');
      return new win.DOMParser().parseFromString(html, 'text/html');
    },
    resolver: {
      attachment: uri => z.URI.getURIItemLibraryKey(uri) || null,
      get personalLibraryID() { return z.Libraries.userLibraryID; },
      groupLibraryID: id => z.Groups.getLibraryIDFromGroupID(id) || null
    },
    yield: () => z.Promise.delay(0)
  };
  return {
    source,
    host(): Host | null {
      const win = z.getMainWindow();
      if (!win || win.closed) return null;
      return {document: win.document, focus: () => win.focus(),
        async openNote(id) {
          if (win.closed) throw new Error('The Zotero window was closed.');
          if (!await liveNote(id)) throw new Error('This note was deleted or moved to the trash. Refresh the results.');
          await win.ZoteroPane.openNote(id);
        },
        createPopup(content, hidden, shown) {
          const doc = win.document as Document & { createXULElement(tag: string): Element };
          const popup = doc.createXULElement('panel') as Element & {
            openPopup(anchor: Element | null, position: string, x: number, y: number, context: boolean): void;
            hidePopup(): void;
          };
          popup.setAttribute('type', 'arrow');
          popup.classList.add('panel-no-padding');
          popup.setAttribute('style', 'max-width:min(400px,calc(100vw - 16px));max-height:min(360px,calc(100vh - 80px))');
          popup.setAttribute('noautofocus', 'false');
          popup.append(content);
          const onHidden = (event: Event) => { if (event.target === popup) hidden(); };
          const onShown = (event: Event) => { if (event.target === popup) shown(); };
          popup.addEventListener('popuphidden', onHidden);
          popup.addEventListener('popupshown', onShown);
          // Capture before the native panel consumes Escape; explicit dismissal restores focus.
          const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && event.target !== content) {
              event.preventDefault(); event.stopImmediatePropagation();
              content.dispatchEvent(new win.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
            }
          };
          const onOutside = (event: MouseEvent) => {
            if (!event.composedPath().includes(popup)) popup.hidePopup();
          };
          doc.documentElement.append(popup);
          return {
            show() {
              doc.addEventListener('keydown', onKey, true);
              doc.addEventListener('mousedown', onOutside, true);
              popup.openPopup(null, 'after_start', Math.max(8, win.innerWidth - 424), 70, false);
            },
            destroy() {
              doc.removeEventListener('keydown', onKey, true);
              doc.removeEventListener('mousedown', onOutside, true);
              popup.removeEventListener('popuphidden', onHidden);
              popup.removeEventListener('popupshown', onShown);
              popup.hidePopup(); popup.remove();
            }
          };
        },
        defer: fn => win.setTimeout(fn, 0), cancelDeferred: id => win.clearTimeout(id),
        onClose(fn) { win.addEventListener('unload', fn); return () => win.removeEventListener('unload', fn); }
      };
    },
    register: fn => z.Reader.registerEventListener('createAnnotationContextMenu', fn, pluginID),
    unregister: fn => z.Reader.unregisterEventListener('createAnnotationContextMenu', fn),
    report: error => z.logError(error)
  };
}
