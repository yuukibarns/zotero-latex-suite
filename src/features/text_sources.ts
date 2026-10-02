// Inspired by Completr's word-list provider (one entry per line, prefix matching).
// Independent implementation: no Obsidian runtime or third-party word data.
export function parseWordList(source: unknown): string[] {
	if (typeof source !== "string") throw new Error("Word dictionary must be plain text");
	if (source.includes("\0")) throw new Error("Word dictionary contains NUL characters");
	return [...new Set(source.replace(/^\uFEFF/, "").split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
}

export class WordIndex {
	private entries: { word: string; key: string }[];
	constructor(words: Iterable<string>) {
		this.entries = [...new Set(words)].map(word => ({ word, key: word.toLowerCase() }));
		this.entries.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : a.word.localeCompare(b.word));
	}
	match(query: string, limit = 50): string[] {
		const prefix = query.toLowerCase();
		if (!prefix) return [];
		let lo = 0, hi = this.entries.length;
		while (lo < hi) { const mid = (lo + hi) >>> 1; if (this.entries[mid].key < prefix) lo = mid + 1; else hi = mid; }
		const result: string[] = [];
		const compare = (a: string, b: string) => Number(!a.startsWith(query)) - Number(!b.startsWith(query)) || a.length - b.length || a.localeCompare(b);
		for (let i = lo; i < this.entries.length && this.entries[i].key.startsWith(prefix); i++) {
			const { word, key } = this.entries[i];
			if (key === prefix) continue;
			// Keep a bounded shortlist, even for very broad dictionary prefixes.
			const pos = result.findIndex(other => compare(word, other) < 0);
			if (pos < 0) { if (result.length < limit) result.push(word); }
			else result.splice(pos, 0, word);
			if (result.length > limit) result.pop();
		}
		return result;
	}
}

export class BufferWords {
	private blocks = new Map<any, string[]>();
	private counts = new Map<string, number>();
	private doc: any = null;
	private index = new WordIndex([]);
	update(doc: any) {
		if (doc === this.doc) return;
		const next = new Map<any, string[]>();
		doc.descendants((node: any) => {
			if (node.type.spec.code || /math|code/i.test(node.type.name)) return false;
			if (!node.isTextblock) return;
			const words = this.blocks.get(node) ?? (node.textBetween(0, node.content.size, " ", " ").match(/[\p{L}][\p{L}\p{M}\p{N}'’-]*/gu) || []);
			next.set(node, words); return false;
		});
		let changed = false;
		for (const [node, words] of this.blocks) if (!next.has(node)) {
			for (const word of words) { const count = this.counts.get(word)! - 1; if (count) this.counts.set(word, count); else this.counts.delete(word); }
			changed = true;
		}
		for (const [node, words] of next) if (!this.blocks.has(node)) {
			for (const word of words) this.counts.set(word, (this.counts.get(word) || 0) + 1);
			changed = true;
		}
		this.blocks = next; this.doc = doc;
		if (changed) this.index = new WordIndex(this.counts.keys());
	}
	match(query: string) { return this.index.match(query); }
}

export function textToken(view: any) {
	if (!view || view.editable === false) return null;
	const s = view.state.selection;
	if (!s.empty || !s.$from.parent.isTextblock || s.$from.parent.type.spec.code) return null;
	if (s.$from.marks().some((mark: any) => /code/i.test(mark.type.name))) return null;
	for (let d = 1; d <= s.$from.depth; d++) if (/math|code/i.test(s.$from.node(d).type.name)) return null;
	const parent = s.$from.parent;
	const before = parent.textBetween(0, s.$from.parentOffset, "\ufffc", "\ufffc");
	if (/(?:^|\s)@@[^@\n]*$/.test(before)) return null;
	const match = /(?:^|[^\p{L}\p{M}\p{N}_@\\])([\p{L}][\p{L}\p{M}\p{N}'’-]*)$/u.exec(before);
	if (!match || /^[\p{L}\p{M}\p{N}'’-]/u.test(parent.textBetween(s.$from.parentOffset, parent.content.size, "\ufffc", "\ufffc"))) return null;
	return { from: s.from - match[1].length, to: s.from, query: match[1] };
}

export type TextSourceSettings = { bufferCompletionEnabled: boolean; dictionaryCompletionEnabled: boolean; textDictionaryWords?: string };
export class TextSources {
	private buffer = new BufferWords();
	private dictionary = new WordIndex([]);
	private source: string | undefined;
	match(doc: any, query: string, settings: TextSourceSettings) {
		if (settings.textDictionaryWords !== this.source) {
			this.source = settings.textDictionaryWords;
			this.dictionary = new WordIndex(parseWordList(this.source || ""));
		}
		const results: { text: string; source: string }[] = [], seen = new Set<string>();
		if (settings.bufferCompletionEnabled) this.buffer.update(doc);
		for (const [label, words] of [
			["Buffer", settings.bufferCompletionEnabled ? this.buffer.match(query) : []],
			["Dictionary", settings.dictionaryCompletionEnabled ? this.dictionary.match(query) : []],
		] as [string, string[]][]) for (const word of words) {
			const key = word.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key); results.push({ text: word, source: label });
		}
		return results.slice(0, 50);
	}
}
