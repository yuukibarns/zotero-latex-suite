import type { Identity, ReferenceResolver, Target } from './types';
function same(a: Identity | null, b: Identity): boolean {
  return !!a && a.libraryID === b.libraryID && a.key === b.key;
}
export function matchReferences(doc: Document, target: Target, resolver: ReferenceResolver): string[] {
  const found = new Set<string>();
  for (const node of doc.querySelectorAll('[data-annotation]')) {
    try {
      const raw = node.getAttribute('data-annotation') || '';
      let ref: { annotationKey?: unknown; attachmentURI?: unknown };
      try { ref = JSON.parse(decodeURIComponent(raw)); }
      catch { ref = JSON.parse(raw); }
      if (!ref || typeof ref.annotationKey !== 'string' || typeof ref.attachmentURI !== 'string') continue;
      if (target.annotationKeys.has(ref.annotationKey) && same(resolver.attachment(ref.attachmentURI), target.attachment)) {
        found.add(ref.annotationKey);
      }
    } catch { /* A broken reference must not hide valid references in the same note. */ }
  }
  for (const node of doc.querySelectorAll('a[href]')) {
    try {
      const url = new URL(node.getAttribute('href') || '');
      if (url.protocol !== 'zotero:' || !['open-pdf', 'open-epub', 'open-snapshot'].includes(url.hostname)) continue;
      const p = url.pathname.split('/').filter(Boolean);
      let identity: Identity | null = null;
      if (p.length === 3 && p[0] === 'library' && p[1] === 'items') identity = {libraryID: resolver.personalLibraryID, key: p[2]};
      else if (p.length === 4 && p[0] === 'groups' && p[2] === 'items' && /^\d+$/.test(p[1])) {
        const libraryID = resolver.groupLibraryID(Number(p[1]));
        if (libraryID !== null) identity = {libraryID, key: p[3]};
      }
      const key = url.searchParams.get('annotation');
      if (key && target.annotationKeys.has(key) && same(identity, target.attachment)) found.add(key);
    } catch { /* Invalid URLs and unavailable groups are unrelated references. */ }
  }
  return [...found];
}

function normalized(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

/** Citation-only matches are evidence, never an exact annotation backlink. */
export function matchEvidence(doc: Document, target: Target, resolver: ReferenceResolver): {
  annotationKeys: string[]; possibleAnnotationKeys: string[];
} {
  const annotationKeys = matchReferences(doc, target, resolver);
  const possible = new Set<string>();
  if (!target.citationHints?.length) return {annotationKeys, possibleAnnotationKeys: []};
  for (const citation of doc.querySelectorAll('[data-citation]')) {
    try {
      const raw = citation.getAttribute('data-citation') || '';
      let data;
      try { data = JSON.parse(decodeURIComponent(raw)); } catch { data = JSON.parse(raw); }
      if (!Array.isArray(data?.citationItems)) continue;
      // Only the text following this citation in its own paragraph belongs to it.
      const block = citation.closest('p,li,blockquote') || citation.parentElement;
      if (!block) continue;
      const citations = [...block.querySelectorAll('[data-citation]')];
      const next = citations[citations.indexOf(citation) + 1];
      const range = doc.createRange(); range.setStartAfter(citation);
      if (next) range.setEndBefore(next); else range.setEnd(block, block.childNodes.length);
      const fragment = range.cloneContents();
      fragment.querySelectorAll('[data-annotation], [data-citation], script, style').forEach(n => n.remove());
      const text = normalized(fragment.textContent || '');
      for (const hint of target.citationHints) {
        if (!target.annotationKeys.has(hint.annotationKey) || annotationKeys.includes(hint.annotationKey)) continue;
        const comment = normalized(hint.comment);
        if (!comment || !text) continue;
        // Match a full phrase, not a substring of another word (cache != caches).
        let found = false, from = 0;
        while (from <= text.length) {
          const at = text.indexOf(comment, from); if (at < 0) break;
          const before = text.slice(0, at).match(/[\p{L}\p{N}]$/u);
          const after = /^[\p{L}\p{N}]/u.test(text.slice(at + comment.length));
          if (!before && !after) { found = true; break; }
          from = at + 1;
        }
        if (!found) continue;
        for (const item of data.citationItems) {
          if (!item || typeof item.locator !== 'string' || normalized(item.locator) !== normalized(hint.page)
            || !Array.isArray(item.uris) || (item.label && item.label !== 'page')) continue;
          if (item.uris.some((uri: unknown) => typeof uri === 'string' && same(resolver.attachment(uri), hint.source))) {
            possible.add(hint.annotationKey); break;
          }
        }
      }
    } catch { /* Malformed citations must not hide other valid matches. */ }
  }
  return {annotationKeys, possibleAnnotationKeys: [...possible]};
}
