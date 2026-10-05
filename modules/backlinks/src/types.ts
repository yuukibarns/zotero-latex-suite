export interface Identity { libraryID: number; key: string }
export interface CitationHint { annotationKey: string; source: Identity; page: string; comment: string }
export interface Target { attachment: Identity; annotationKeys: ReadonlySet<string>; citationHints?: CitationHint[] }
export interface NoteRow { id: number; html: string }
export interface NoteInfo { id: number; title: string; parent: string; library: string }
export interface Match extends NoteInfo { annotationKeys: string[]; possibleAnnotationKeys?: string[] }
export interface Progress { scanned: number; matched: number }
export interface ReferenceResolver {
  attachment(uri: string): Identity | null;
  personalLibraryID: number;
  groupLibraryID(groupID: number): number | null;
}
export interface SearchSource {
  target(attachmentID: number, keys: string[]): Promise<Target>;
  ceiling(): Promise<number>;
  rows(after: number, ceiling: number, limit: number): Promise<NoteRow[]>;
  note(id: number): Promise<NoteInfo | null>;
  parse(html: string): Document;
  resolver: ReferenceResolver;
  yield(): Promise<void>;
}
export interface Host {
  document: Document;
  focus(): void;
  openNote(id: number): Promise<void>;
  createPopup(content: HTMLElement, hidden: () => void, shown: () => void): { show(): void; destroy(): void };
  defer(fn: () => void): number;
  cancelDeferred(id: number): void;
  onClose(fn: () => void): () => void;
}
export interface ReaderMenu {
  reader: { itemID: number };
  params: { ids?: string[] };
  append(item: { label: string; onCommand(): void }): void;
}
export interface Platform {
  source: SearchSource;
  host(): Host | null;
  register(fn: (event: ReaderMenu) => void): void;
  unregister(fn: (event: ReaderMenu) => void): void;
  report(error: unknown): void;
}
