/* LaTeX Suite — a Zotero plugin (bootstrapped, Zotero 7+).
 *
 * A port of the snippets half of obsidian-latex-suite to Zotero's note editor.
 * This file is the chrome side and does three small things:
 *
 *   1. Registers the settings pane.
 *   2. Injects build/content-script.js into every note-editor and reader iframe.
 *      The engine has to run *inside* those windows: it drives Zotero's own
 *      ProseMirror instance and its React annotation fields, and reaching those
 *      objects from chrome across Xray wrappers would be misery.
 *   3. Renders `$…$` in the item pane's annotation rows, which are chrome rather
 *      than reader content, so the injected bundle cannot reach them.
 *   4. Pushes settings changes through to the editors that are already open.
 *
 * See notes/zotero-note-editor.md for how the note editor is put together.
 */

const PREF = "extensions.zotero.latexSuite.settings";

/* Scalar defaults, mirrored from src/settings/settings.ts, which is the source
 * of truth — the content script merges the stored overrides over its own copy.
 * These exist so the settings pane can show what a field falls back to.
 * test.js fails if the two drift apart. */
const FIELDS = [
	{ group: "Completion", key: "completionEnabled", type: "bool", default: true, label: "Enable completion in note equations" },
	{ group: "Completion", key: "bufferCompletionEnabled", type: "bool", default: true, label: "Complete words from the current note" },
	{ group: "Completion", key: "dictionaryCompletionEnabled", type: "bool", default: true, label: "Enable word dictionary completion" },
	{ group: "Completion", key: "textDictionaryFileLocation", type: "file", default: "", label: "Word dictionary file", hint: "Plain text, one word or phrase per line (Completr word-list format)." },
	{ group: "Completion", key: "inlineMathPreviewEnabled", type: "bool", default: true, label: "Live preview for inline math" },
	{ group: "Completion", key: "mathHighlightEnabled", type: "bool", default: true, label: "Highlight LaTeX source in note equations" },
	{ group: "Math selection", key: "mathSelectionClickTimeoutMs", type: "number", default: 1000, min: 200, max: 5000, step: 100, label: "Repeated-click timeout (ms, 200–5000)", hint: "Maximum pause between clicks before structural selection starts over." },
	{ group: "Completion", key: "displayMathPreviewEnabled", type: "bool", default: true, label: "Live preview for display math" },
	{ group: "Completion", key: "mathPreviewDebounceMs", type: "number", default: 100, label: "Preview debounce (ms, 0 = immediate, maximum 2000)" },
	{ group: "Completion", key: "mathPreviewMarkerColor", type: "text", default: "#d9468f", label: "Preview caret color (#RRGGBB)", hint: "Accent color for the position marker in inline and display previews." },
	{ group: "Completion", key: "mathPreviewMarkerBlink", type: "bool", default: false, label: "Blink preview caret when idle", hint: "Steady while typing. Respects the system reduced-motion setting." },
	{ group: "Completion", key: "completionMinLength", type: "number", default: 2, label: "Minimum completion prefix length" },
	{ group: "Completion", key: "loadCompletionFromFile", type: "bool", default: false, label: "Load custom completion dictionary" },
	{ group: "Completion", key: "completionFileLocation", type: "file", default: "", label: "Completion JSON file", hint: "Completr latex_commands.json format. Replaces the built-in dictionary." },
	{ group: "Snippet files", key: "loadSnippetsFromFile", type: "bool", default: false,
		label: "Load snippets from a file",
		hint: "Point at a .js or .md file, or a folder of them \u2014 an obsidian-latex-suite snippets file works as-is. Re-read whenever it changes on disk." },
	{ group: "Snippet files", key: "snippetsFileLocation", type: "file", default: "",
		label: "Snippets file" },
	{ group: "Snippet files", key: "loadSnippetVariablesFromFile", type: "bool", default: false,
		label: "Load snippet variables from a file" },
	{ group: "Snippet files", key: "snippetVariablesFileLocation", type: "file", default: "",
		label: "Snippet variables file" },

	{ group: "Snippets", key: "snippetsEnabled", type: "bool", default: true,
		label: "Enable snippets" },
	{ group: "Snippets", key: "snippetsTrigger", type: "text", default: "Tab",
		label: "Expand a snippet", hint: "Key that expands a non-automatic snippet." },
	{ group: "Snippets", key: "snippetNextTabstopTrigger", type: "text", default: "Tab",
		label: "Next tabstop" },
	{ group: "Snippets", key: "snippetPreviousTabstopTrigger", type: "text", default: "Shift-Tab",
		label: "Previous tabstop" },
	{ group: "Snippets", key: "removeSnippetWhitespace", type: "bool", default: true,
		label: "Remove trailing whitespace in inline math" },
	{ group: "Snippets", key: "snippetRecursion", type: "number", default: 0,
		label: "Recursive expansions", hint: "How many times an expansion may itself trigger another snippet." },

	{ group: "Auto-fraction", key: "autofractionEnabled", type: "bool", default: true,
		label: "Enable auto-fraction" },
	{ group: "Auto-fraction", key: "autofractionTrigger", type: "text", default: "/",
		label: "Trigger" },
	{ group: "Auto-fraction", key: "autofractionSymbol", type: "text", default: "\\frac",
		label: "Fraction command" },
	{ group: "Auto-fraction", key: "autofractionBreakingChars", type: "text", default: "+-=\t",
		label: "Breaking characters", hint: "Characters that end the numerator." },
	{ group: "Auto-fraction", key: "autofractionExcludedEnvs", type: "code", rows: 4,
		default: `[\n\t\t["^{", "}"],\n\t\t["\\\\pu{", "}"]\n\t]`,
		label: "Excluded environments", hint: "JSON array of [open, close] pairs." },

	{ group: "Matrix shortcuts", key: "matrixShortcutsEnabled", type: "bool", default: true,
		label: "Enable matrix shortcuts" },
	{ group: "Matrix shortcuts", key: "matrixShortcutsCellTrigger", type: "text", default: "Tab",
		label: "New cell" },
	{ group: "Matrix shortcuts", key: "matrixShortcutsNewlineTrigger", type: "text", default: "Enter",
		label: "New row" },
	{ group: "Matrix shortcuts", key: "matrixShortcutsLineBreakTrigger", type: "text", default: "Ctrl-Enter",
		label: "Source newline", hint: "Insert a literal newline without a LaTeX row separator." },
	{ group: "Matrix shortcuts", key: "matrixShortcutsExitTrigger", type: "text", default: "Shift-Enter",
		label: "Leave" },
	{ group: "Matrix shortcuts", key: "matrixShortcutsEnvNames", type: "text",
		default: "pmatrix, cases, align, gather, bmatrix, Bmatrix, vmatrix, Vmatrix, array, matrix",
		label: "Environments" },
	{ group: "Matrix shortcuts", key: "matrixShortcutsMacroNames", type: "text", default: "eqalign",
		label: "Macros" },

	{ group: "Tabout", key: "taboutEnabled", type: "bool", default: true,
		label: "Enable tabout" },
	{ group: "Tabout", key: "taboutTrigger", type: "text", default: "Tab",
		label: "Trigger" },
	{ group: "Tabout", key: "taboutExitEquationOnlyOnEOL", type: "bool", default: true,
		label: "Only leave an equation from its end" },
	{ group: "Tabout", key: "taboutClosingSymbols", type: "text",
		default: "), ], \\rbrack, \\}, \\rbrace, \\rangle, \\rvert, \\rVert, \\rfloor, \\rceil, \\urcorner, }",
		label: "Closing symbols" },

	{ group: "Brackets", key: "autoEnlargeBrackets", type: "bool", default: true,
		label: "Auto-enlarge brackets" },
	{ group: "Brackets", key: "autoEnlargeBracketsSpace", type: "bool", default: true,
		label: "Add a space after \\left / before \\right" },
	{ group: "Brackets", key: "autoEnlargeBracketsTriggers", type: "text",
		default: "sum, int, frac, prod, bigcup, bigcap",
		label: "Triggers", hint: "Commands inside a bracket pair that make it worth enlarging." },

	{ group: "Annotations", key: "annotationSnippetsEnabled", type: "bool", default: true,
		label: "Snippets in annotation comments",
		hint: "Comments are plain text, so equations there are written as $\u2026$, the way they are in Markdown." },
	{ group: "Annotations", key: "annotationMathEnabled", type: "bool", default: true,
		label: "Render math in annotations",
		hint: "Shows $\u2026$ as an equation when the comment is not being edited." },

	{ group: "Advanced", key: "wordDelimiters", type: "text",
		default: "., +-\\n\t:;!?\\/{}[]()=~$'\"|`<>*^%#@&",
		label: "Word delimiters", hint: "Used by the \"w\" (word boundary) snippet option." },
	{ group: "Advanced", key: "snippetDebug", type: "select", default: "off",
		options: ["off", "info", "verbose"], label: "Log expansions to the console" },
];

let rootURI = null;
let contentScript = null;
let katexScript = null;
let defaultSnippets = "";
let defaultSnippetVariables = "";
let prefPane = null;
let prefObserver = null;
let origRegisterEditorInstance = null;
let onReaderEvent = null;

/* --- settings ------------------------------------------------------------ */

/* The pref holds the whole snippet source, tens of kilobytes of it, so parsing
 * it is not something to do casually. Cached until the pref changes. */
let overridesCache = null;
let overridesJSON = null;
let payloadJSON = null;

/* Snippets can come from a file on disk instead of the settings pane — the
 * point being that an obsidian-latex-suite snippets file works unchanged. The
 * engine runs in a content window and cannot read files, so the contents are
 * read here and travel with the settings. */
const SOURCES = [
	{ key: "textDictionaryWords", enabledKey: "dictionaryCompletionEnabled", pathKey: "textDictionaryFileLocation" },
	{ key: "completionCommands", enabledKey: "loadCompletionFromFile", pathKey: "completionFileLocation" },
	{ key: "snippets", enabledKey: "loadSnippetsFromFile", pathKey: "snippetsFileLocation" },
	{ key: "snippetVariables", enabledKey: "loadSnippetVariablesFromFile", pathKey: "snippetVariablesFileLocation" },
];

const fileSources = new Map(); // settings key -> { path, text, stamp, error }
let pollTimer = null;

function readOverrides() {
	if (overridesCache) return overridesCache;
	overridesJSON = Zotero.Prefs.get(PREF, true) || "{}";
	try {
		const parsed = JSON.parse(overridesJSON);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			overridesCache = parsed;
			for (const key of ["inlineMathPreviewEnabled", "displayMathPreviewEnabled"]) {
				if (parsed[key] === undefined && typeof parsed.mathPreviewEnabled === "boolean") parsed[key] = parsed.mathPreviewEnabled;
			}
			overridesJSON = JSON.stringify(parsed);
		} else {
			overridesCache = {};
			overridesJSON = "{}"; // the string is handed straight to the engine
		}
	} catch (e) {
		Zotero.debug("LaTeX Suite: unreadable settings pref - " + e);
		overridesCache = {};
		overridesJSON = "{}";
	}
	return overridesCache;
}

function forgetOverrides() {
	overridesCache = null;
	overridesJSON = null;
	payloadJSON = null;
}

function fileSourceFor(source) {
	const overrides = readOverrides();
	const enabled = (overrides[source.enabledKey] ?? FIELDS.find(field => field.key === source.enabledKey)?.default) === true;
	const path = (overrides[source.pathKey] || "").trim();
	return enabled && path ? path : null;
}

/** A snippets path is a file, or a folder of them, as upstream's own docs suggest. */
function filesAt(path) {
	const target = Zotero.File.pathToFile(path);
	if (!target.exists()) throw new Error("no such file or folder");
	if (!target.isDirectory()) return [target];

	const children = [];
	const entries = target.directoryEntries;
	while (entries.hasMoreElements()) {
		const entry = entries.getNext().QueryInterface(Components.interfaces.nsIFile);
		if (entry.isFile() && !entry.leafName.startsWith(".")) children.push(entry);
	}
	// By name, so priority ties break the same way on every machine.
	children.sort((a, b) => (a.leafName < b.leafName ? -1 : a.leafName > b.leafName ? 1 : 0));
	return children;
}

/** Names and mtimes together, so adding or removing a file counts as a change. */
const stampOf = (files) => files.map((f) => f.leafName + ":" + f.lastModifiedTime).join("|");

/** Read a path into what the engine wants: one source, or one per file. */
async function readSourceAt(path) {
	const files = filesAt(path);
	if (!files.length) throw new Error("folder contains no files");
	const sources = await Promise.all(files.map((f) => Zotero.File.getContentsAsync(f.path, "utf-8")));
	return { sources, files, stamp: stampOf(files) };
}

/**
 * Re-read whichever sources come from disk. Returns true if anything changed,
 * so callers know whether the open editors need telling.
 */
async function refreshFileSources() {
	let changed = false;

	for (const source of SOURCES) {
		const path = fileSourceFor(source);
		if (!path) {
			if (fileSources.delete(source.key)) changed = true;
			continue;
		}

		const previous = fileSources.get(source.key);
		let stamp;
		try {
			// nsIFile rather than IOUtils: confirmed present in this scope, and a
			// stat is cheap enough not to be worth an async round trip.
			stamp = stampOf(filesAt(path));
		} catch (e) {
			// Missing or unreadable: keep the last good copy rather than dropping
			// the user's snippets because a vault happens to be offline.
			if (previous && previous.error) continue;
			fileSources.set(source.key, { path, text: previous?.text ?? null, stamp: null, error: String(e) });
			Zotero.debug("LaTeX Suite: cannot read " + path + " - " + e);
			changed = true;
			continue;
		}

		if (previous && previous.path === path && previous.stamp === stamp && !previous.error) continue;

		try {
			const { sources } = await readSourceAt(path);
			let text = sources.length === 1 ? sources[0] : sources;
			if (source.key === "textDictionaryWords") {
				if (sources.length !== 1 || Zotero.File.pathToFile(path).isDirectory()) throw new Error("Choose one plain-text word dictionary file");
				if (sources[0].includes("\0")) throw new Error("Word dictionary contains NUL characters");
				text = sources[0];
			}
			if (source.key === "completionCommands") {
				if (sources.length !== 1 || Zotero.File.pathToFile(path).isDirectory()) throw new Error("Choose one completion JSON file");
				text = JSON.parse(sources[0]);
				if (!Array.isArray(text) || text.some(x => typeof x !== "string" && (!x || typeof x.displayName !== "string" || !x.displayName || /[\r\n]/.test(x.displayName) || typeof x.replacement !== "string")) || text.some(x => typeof x === "string" && (!x || /[\r\n]/.test(x)))) throw new Error("Invalid completion dictionary entries");
			}
			fileSources.set(source.key, { path, text, stamp, error: null });
			changed = true;
		} catch (e) {
			fileSources.set(source.key, { path, text: previous?.text ?? null, stamp: null, error: String(e) });
			Zotero.debug("LaTeX Suite: cannot read " + path + " - " + e);
			changed = true;
		}
	}

	if (changed) payloadJSON = null;
	return changed;
}

/** Poll for edits to those files, but only while at least one is in use. */
function syncFilePolling() {
	const wanted = SOURCES.some((source) => fileSourceFor(source));
	if (wanted === !!pollTimer) return;

	if (!wanted) {
		clearInterval(pollTimer);
		pollTimer = null;
		return;
	}
	// A stat every few seconds is nothing, and it means editing snippets in your
	// own editor shows up in Zotero without a round trip through settings.
	pollTimer = setInterval(async () => {
		try {
			if (await refreshFileSources()) pushSettings();
		} catch (e) {
			Zotero.debug("LaTeX Suite: " + e);
		}
	}, 3000);
}

/**
 * What travels to the engine: the overrides, plus any source read from disk.
 *
 * Only the overrides are sent, not a full settings object, so a field the user
 * never touched keeps following the shipped default.
 */
function settingsJSON() {
	if (payloadJSON) return payloadJSON;

	readOverrides();
	if (fileSources.size === 0) {
		payloadJSON = overridesJSON; // already exactly this JSON; don't re-serialise
		return payloadJSON;
	}

	const payload = { ...overridesCache };
	for (const [key, source] of fileSources) {
		if (source.text !== null) payload[key] = source.text;
	}
	payloadJSON = JSON.stringify(payload);
	return payloadJSON;
}

function mathEnabled() {
	return readOverrides().annotationMathEnabled !== false;
}

/* --- injection ----------------------------------------------------------- */

function runScript(doc, source) {
	// A <script> element, not eval from chrome: the engine needs native access to
	// the page's own objects, and these are resource:// pages with no CSP (they
	// already run inline scripts of Zotero's own).
	const script = doc.createElement("script");
	script.textContent = source;
	doc.documentElement.appendChild(script);
	script.remove();
}

const annotationCache = new Map();
const annotationCandidates = new Map(); // bounded prefix cache; each set is complete
let annotationRevision = 0;
let annotationLoaded = false, annotationLoading = null, annotationObserver = null, annotationStopped = false;
const annotationDirty = new Set();
const annotationSQL = `SELECT a.itemID AS id, i.libraryID, a.parentItemID AS attachmentID,
 p.parentItemID AS parentID, a.text, a.comment,
 COALESCE(v.value, ai.key) AS source
 FROM itemAnnotations a JOIN items i ON i.itemID=a.itemID
 JOIN items ai ON ai.itemID=a.parentItemID
 JOIN itemAttachments p ON p.itemID=a.parentItemID
 LEFT JOIN itemData d ON d.itemID=COALESCE(p.parentItemID,p.itemID) AND d.fieldID=?
 LEFT JOIN itemDataValues v ON v.valueID=d.valueID
 WHERE NOT EXISTS (SELECT 1 FROM deletedItems x WHERE x.itemID IN (a.itemID,a.parentItemID,p.parentItemID))`;

function watchAnnotationCache() {
	if (annotationObserver !== null) return;
	annotationStopped = false;
	annotationObserver = Zotero.Notifier.registerObserver({ notify(event, type, ids) {
		for (const id of ids) if (Number.isSafeInteger(Number(id))) annotationDirty.add(Number(id));
	} }, ["item"], "latex-suite-annotation-cache");
}
async function loadAnnotationCache() {
	watchAnnotationCache();
	if (annotationLoading) return annotationLoading;
	annotationLoading = (async () => {
		while (!annotationLoaded || annotationDirty.size) {
			const full = !annotationLoaded;
			const ids = Array.from(annotationDirty).slice(0, 200);
			ids.forEach(id => annotationDirty.delete(id));
			const marks = ids.map(() => "?").join(",");
			const suffix = full ? "" : ` AND (a.itemID IN (${marks}) OR a.parentItemID IN (${marks}) OR p.parentItemID IN (${marks}))`;
			const start = Date.now();
			let rows;
			try { rows = await Zotero.DB.queryAsync(annotationSQL + suffix, [Zotero.ItemFields.getID("title"), ...(full ? [] : [...ids, ...ids, ...ids])]); }
			catch (error) { ids.forEach(id => annotationDirty.add(id)); throw error; }
			if (annotationStopped) return;
			annotationRevision++; annotationCandidates.clear();
			if (full) annotationCache.clear();
			else {
				const changed = new Set(ids);
				for (const [id, row] of annotationCache) if (changed.has(id) || changed.has(row.attachmentID) || changed.has(row.parentID)) annotationCache.delete(id);
			}
			for (let n = 0; n < rows.length; n++) {
				if (annotationStopped) return;
				// queryAsync rows proxy getResultByName; added properties cannot
				// be read through that proxy. Copy only known SQL columns first.
				const db = rows[n];
				const row = { id: db.id, libraryID: db.libraryID, attachmentID: db.attachmentID,
					parentID: db.parentID, text: db.text, comment: db.comment, source: db.source };
				row.comment = row.comment || ""; row.text = row.text || "";
				annotationCache.set(row.id, row);
				if (n % 500 === 499) await Zotero.Promise.delay(0);
			}
			annotationLoaded = true;
			Zotero.debug(`LaTeX Suite annotation cache: ${full ? "initial" : "update"}, ${rows.length} rows, ${Date.now()-start} ms`);
		}
	})().finally(() => { annotationLoading = null; });
	return annotationLoading;
}
function annotationFuzzyScore(text, query) {
	const exact = text.indexOf(query);
	if (exact >= 0) return exact === 0 ? 0 : 1 + exact / (text.length + 1);
	let next = 0, first = -1, last = -1;
	for (const character of query) {
		last = text.indexOf(character, next);
		if (last < 0) return Infinity;
		if (first < 0) first = last;
		next = last + character.length;
	}
	return 3 + (last - first + 1 - query.length) / Math.max(1, query.length);
}
async function searchAnnotationCache(libraryID, query, minimum = 2) {
	const q = String(query || "").trim().toLowerCase();
	minimum = Math.max(1, Math.floor(Number(minimum) || 2));
	if (q.length < minimum) return [];
	await loadAnnotationCache();
	const prefix = q.slice(0, minimum), key = JSON.stringify([libraryID, minimum, prefix]);
	const revision = annotationRevision;
	let candidates = annotationCandidates.get(key), n = 0;
	if (!candidates) {
		candidates = [];
		for (const row of annotationCache.values()) {
			if (annotationStopped || revision !== annotationRevision) return [];
				if (row.libraryID === libraryID && [row.text,row.comment].some(value => value.toLowerCase().includes(prefix))) candidates.push(row);
			if (++n % 1000 === 0) await Zotero.Promise.delay(0);
		}
	}
	if (annotationStopped || revision !== annotationRevision) return [];
	annotationCandidates.delete(key); annotationCandidates.set(key, candidates);
	while (annotationCandidates.size > 8) annotationCandidates.delete(annotationCandidates.keys().next().value);
	const matches = [];
	for (const row of candidates) {
		if (annotationStopped || revision !== annotationRevision) return [];
		const score = Math.min(...[row.text,row.comment].map(value => annotationFuzzyScore(value.toLowerCase(), q)));
		if (Number.isFinite(score)) matches.push({ row, score });
		if (++n % 1000 === 0) await Zotero.Promise.delay(0);
	}
	matches.sort((a,b) => a.score-b.score || a.row.id-b.row.id);
	return matches.slice(0,50).map(({row:{id,text,comment,source}}) => ({id,text:text.slice(0,500),comment:comment.slice(0,500),source}));
}
function stopAnnotationCache() {
	annotationStopped = true;
	if (annotationObserver !== null) Zotero.Notifier.unregisterObserver(annotationObserver);
	annotationObserver = null; annotationCache.clear(); annotationDirty.clear(); annotationLoaded = false;
	annotationCandidates.clear(); annotationRevision++;
}

function annotationInsertText(annotation) {
	const text = annotation.annotationText || "";
	const result = text.trim() ? text : annotation.annotationComment || "";
	if (!result.trim()) throw new Error("This annotation has no text or comment to insert.");
	return result;
}

function inject(win, { withKatex } = {}) {
	const doc = win.document;
	if (!doc || !doc.documentElement) return;

	const content = win.wrappedJSObject;
	content.__latexSuiteSettings = settingsJSON();
	if (!withKatex) Components.utils.exportFunction((id, query, minimum) => new content.Promise((resolve, reject) => {
		(async () => {
			const instance = (Zotero.Notes._editorInstances || []).find(x => x._iframeWindow?.wrappedJSObject === content);
			const note = instance && Zotero.Items.get(instance.itemID);
			if (!note) throw new Error("Save this note before searching annotations.");
			if (id === undefined) return JSON.stringify(await searchAnnotationCache(note.libraryID, query, minimum));
			await loadAnnotationCache();
			const annotation = await Zotero.Items.getAsync(id);
			if (!annotationCache.has(id) || !annotation?.isAnnotation() || annotation.libraryID !== note.libraryID || annotation.deleted) throw new Error("Annotation is no longer available in this library.");
			return annotationInsertText(annotation);
		})().then(resolve, error => reject(new content.Error(String(error))));
	}), content, { defineAs: "__latexSuiteAnnotations" });
	if (!withKatex) Components.utils.exportFunction(() => new content.Promise((resolve, reject) => {
		(async () => {
		const instance = (Zotero.Notes._editorInstances || []).find(x => x._iframeWindow?.wrappedJSObject === content);
		if (!instance?.itemID) throw new Error("Save the note before opening it in a tab.");
		await instance.saveSync();
		await Zotero.Notes.open(instance.itemID, undefined, { openInWindow: false });
		})().then(() => resolve(), error => reject(new content.Error(String(error))));
	}), content, { defineAs: "__latexSuiteOpenNoteTab" });

	if (content.__latexSuiteInstalled) {
		if (content.__latexSuiteReload) content.__latexSuiteReload(settingsJSON());
		return;
	}

	if (withKatex) ensureKatex(win);
	runScript(doc, contentScript);
}

/* KaTeX is a quarter of a megabyte, and notes never need it — Zotero renders
 * their equations itself. Read it only if annotation rendering is switched on,
 * and inject it only into readers. */
async function ensureKatexScript() {
	if (katexScript !== null || !mathEnabled()) return katexScript;
	try {
		katexScript = await Zotero.File.getResourceAsync(rootURI + "vendor/katex.min.js");
	} catch (e) {
		Zotero.debug("LaTeX Suite: could not read KaTeX - " + e);
	}
	return katexScript;
}

function ensureKatex(win) {
	const content = win.wrappedJSObject;
	if (content.katex || !katexScript || !mathEnabled()) return false;
	runScript(win.document, katexScript);
	return true;
}

function attach(instance) {
	const win = instance && instance._iframeWindow;
	if (!win) return;
	const doc = win.document;
	if (!doc || doc.readyState === "loading") {
		win.addEventListener("DOMContentLoaded", () => inject(win), { once: true });
	} else {
		inject(win);
	}
}

function attachReader(reader) {
	const win = reader && reader._iframeWindow;
	if (!win) return;
	const doc = win.document;
	if (!doc || doc.readyState === "loading") {
		win.addEventListener("DOMContentLoaded", () => inject(win, { withKatex: true }), { once: true });
	} else {
		inject(win, { withKatex: true });
	}
}

/** Every window the engine is running in: note editors and readers alike. */
function eachTarget(fn) {
	const windows = [
		...(Zotero.Notes._editorInstances || []).map((x) => x && x._iframeWindow),
		...(Zotero.Reader._readers || []).map((x) => x && x._iframeWindow),
	];
	for (const win of windows) {
		try {
			if (win) fn(win);
		} catch (e) {
			Zotero.debug("LaTeX Suite: " + e);
		}
	}
}

/** Hand the current settings to every editor that is already open. */
function pushSettings() {
	const json = settingsJSON();
	eachTarget((win) => {
		const content = win.wrappedJSObject;
		if (content.__latexSuiteReload) content.__latexSuiteReload(json);
	});
	eachItemPane((handle) => handle.refresh());
}

async function onSettingsChanged() {
	forgetOverrides();

	// A reader that started with rendering off has no KaTeX yet; give it one
	// before telling the engine to look again.
	await ensureKatexScript();
	for (const reader of Zotero.Reader._readers || []) {
		try {
			if (reader?._iframeWindow) ensureKatex(reader._iframeWindow);
		} catch (e) {
			Zotero.debug("LaTeX Suite: " + e);
		}
	}

	syncFilePolling();
	await refreshFileSources();
	pushSettings();
}

/* --- the item pane's annotation rows ------------------------------------- */

/* Those rows are chrome, not reader content, so the injected bundle cannot see
 * them. They are read-only, which makes this the easy half: render and leave it
 * alone — there is no editing to put the `$…$` back for. */
/* Keyed weakly, and iterated through Zotero's own window list, so a window that
 * closes without us hearing about it is not pinned in memory by this. */
const itemPaneWindows = new WeakMap();

function eachItemPane(fn) {
	for (const window of Zotero.getMainWindows()) {
		const handle = itemPaneWindows.get(window);
		if (handle) fn(handle, window);
	}
}

const ROW_SELECTOR = "annotation-row .comment";

function installItemPaneRendering(window) {
	const doc = window.document;
	const root = doc.getElementById("zotero-item-pane") || doc.documentElement;
	if (!root) return null;

	// Half a megabyte of scripts, loaded the first time an annotation with a
	// comment actually shows up rather than on every window that opens.
	let loaded = false;
	const load = () => {
		if (loaded) return true;
		try {
			Services.scriptloader.loadSubScript(rootURI + "vendor/katex.min.js", window);
			Services.scriptloader.loadSubScript(rootURI + "build/render.js", window);
			loaded = !!(window.LatexSuiteRender && window.katex);
		} catch (e) {
			Zotero.debug("LaTeX Suite: renderer failed to load in the item pane - " + e);
			loaded = false;
		}
		return loaded;
	};

	let scheduled = 0;

	const tick = () => {
		scheduled = 0;
		const rows = doc.querySelectorAll(ROW_SELECTOR);
		if (!rows.length) return;
		if (mathEnabled()) {
			if (!load()) return;
			// syncRender, not renderMath: it does nothing when the DOM already
			// matches, which is what keeps this off the observer's treadmill.
			for (const el of rows) window.LatexSuiteRender.syncRender(el, window.katex);
		} else if (loaded) {
			for (const el of rows) {
				window.LatexSuiteRender.unrenderMath(el);
				window.LatexSuiteRender.clearRenderState(el);
			}
		}
	};
	const schedule = () => {
		if (!scheduled) scheduled = window.requestAnimationFrame(tick);
	};

	const observer = new window.MutationObserver(schedule);
	observer.observe(root, { childList: true, subtree: true });
	schedule();

	return {
		refresh: schedule,
		destroy() {
			observer.disconnect();
			if (scheduled) window.cancelAnimationFrame(scheduled);
			if (!loaded) return;
			for (const el of doc.querySelectorAll(ROW_SELECTOR)) {
				window.LatexSuiteRender.unrenderMath(el);
				window.LatexSuiteRender.clearRenderState(el);
			}
		},
	};
}

const noteTabMenus = new Map();
function installNoteTabMenu(window) {
	if (noteTabMenus.has(window)) return;
	const doc = window.document;
	const show = event => {
		const popup = event.target;
		if (!popup.matches?.(".context-pane-list-popup")) return;
		if (popup.querySelector(".latex-suite-edit-note-tab")) return;
		const native = popup.querySelector(".context-pane-list-edit-in-window");
		if (!native) return;
		const item = doc.createXULElement("menuitem");
		item.className = "latex-suite-edit-note-tab";
		item.setAttribute("label", "Edit in New Tab");
		item.addEventListener("command", () => {
			const id = Number(popup.dataset.itemId);
			if (!Number.isSafeInteger(id) || id <= 0) return;
			Zotero.Notes.open(id, undefined, { openInWindow: false }).catch(error => {
				Zotero.logError(error); window.alert(String(error));
			});
		});
		native.after(item);
	};
	doc.addEventListener("popupshowing", show);
	noteTabMenus.set(window, () => {
		doc.removeEventListener("popupshowing", show);
		doc.querySelectorAll(".latex-suite-edit-note-tab").forEach(item => item.remove());
	});
}

function onMainWindowLoad({ window }) {
	installNoteTabMenu(window);
	if (!rootURI || itemPaneWindows.has(window)) return;
	try {
		const handle = installItemPaneRendering(window);
		if (handle) itemPaneWindows.set(window, handle);
	} catch (e) {
		Zotero.debug("LaTeX Suite: item pane rendering failed - " + e);
	}
}

function onMainWindowUnload({ window }) {
	noteTabMenus.get(window)?.(); noteTabMenus.delete(window);
	const handle = itemPaneWindows.get(window);
	if (!handle) return;
	handle.destroy();
	itemPaneWindows.delete(window);
}

/* --- plugin lifecycle ---------------------------------------------------- */

async function startup({ id, rootURI: uri }) {
	rootURI = uri;

	// getResourceAsync, not getContentsFromURLAsync: rootURI is a jar: URL when
	// the plugin is installed packed, and only the channel-based reader handles it.
	try {
		contentScript = await Zotero.File.getResourceAsync(rootURI + "build/content-script.js");
		defaultSnippets = await Zotero.File.getResourceAsync(rootURI + "src/default_snippets.js");
		defaultSnippetVariables = await Zotero.File.getResourceAsync(rootURI + "src/default_snippet_variables.js");
	} catch (e) {
		// Without these there is nothing to inject; say so rather than failing
		// silently and leaving no settings pane either.
		Zotero.logError(new Error("LaTeX Suite: could not read its own files - " + e));
		return;
	}
	await ensureKatexScript();

	syncFilePolling();
	await refreshFileSources();

	// The prefs pane reads these instead of duplicating them.
	Zotero.LatexSuite = {
		PREF,
		FIELDS,
		defaultSnippets,
		defaultSnippetVariables,
		/** What each file-backed source is doing right now, for the settings pane. */
		fileStatus: (key) => fileSources.get(key) ?? null,
		readSourceAt,
		reloadFiles: async () => {
			await refreshFileSources();
			pushSettings();
		},
	};

	Zotero.PreferencePanes.register({
		pluginID: id,
		src: rootURI + "prefs.xhtml",
		scripts: [rootURI + "prefs.js"],
		stylesheets: [rootURI + "prefs.css"],
		label: "LaTeX Suite",
	}).then(
		(paneID) => { prefPane = paneID; },
		(e) => Zotero.debug("LaTeX Suite: prefs pane failed to register - " + e),
	);

	prefObserver = Zotero.Prefs.registerObserver(PREF, onSettingsChanged, true);

	// New note editors, as they open. registerEditorInstance runs at the top of
	// EditorInstance.init, before _iframeWindow is assigned, so look again on
	// the next tick.
	origRegisterEditorInstance = Zotero.Notes.registerEditorInstance;
	Zotero.Notes.registerEditorInstance = function (instance) {
		const result = origRegisterEditorInstance.apply(this, arguments);
		Zotero.Promise.delay(0).then(() => {
			try { attach(instance); } catch (e) { Zotero.debug("LaTeX Suite: " + e); }
		});
		return result;
	};

	// Readers, as they open. renderToolbar fires once per reader; the sweep below
	// catches the ones that were already open when the plugin loaded.
	onReaderEvent = (event) => {
		try { attachReader(event.reader); } catch (e) { Zotero.debug("LaTeX Suite: " + e); }
	};
	Zotero.Reader.registerEventListener("renderToolbar", onReaderEvent, id);

	for (const instance of Zotero.Notes._editorInstances || []) {
		try { attach(instance); } catch (e) { Zotero.debug("LaTeX Suite: " + e); }
	}
	for (const reader of Zotero.Reader._readers || []) {
		try { attachReader(reader); } catch (e) { Zotero.debug("LaTeX Suite: " + e); }
	}
	for (const window of Zotero.getMainWindows()) onMainWindowLoad({ window });
}

/* Shutdown runs during an upgrade, and every step of it touches something that
 * can be in an awkward state — a window mid-close, a pane already unregistered.
 * One throw must not stop the rest from being undone. */
function safely(what, fn) {
	try {
		fn();
	} catch (e) {
		Zotero.debug("LaTeX Suite: " + what + " failed during shutdown - " + e);
	}
}

function shutdown() {
	stopAnnotationCache();
	for (const cleanup of noteTabMenus.values()) cleanup();
	noteTabMenus.clear();
	safely("restoring registerEditorInstance", () => {
		if (origRegisterEditorInstance) Zotero.Notes.registerEditorInstance = origRegisterEditorInstance;
	});
	origRegisterEditorInstance = null;

	safely("unregistering the reader listener", () => {
		if (onReaderEvent && Zotero.Reader.unregisterEventListener) {
			Zotero.Reader.unregisterEventListener("renderToolbar", onReaderEvent);
		}
	});
	onReaderEvent = null;

	safely("uninstalling from editors", () => {
		eachTarget((win) => {
			const content = win.wrappedJSObject;
			if (content.__latexSuiteUninstall) content.__latexSuiteUninstall();
			delete content.__latexSuiteOpenNoteTab;
			delete content.__latexSuiteAnnotations;
		});
	});

	safely("tearing down item panes", () => {
		eachItemPane((handle, window) => {
			try {
				handle.destroy();
			} finally {
				itemPaneWindows.delete(window);
			}
		});
	});

	safely("stopping the file poll", () => {
		if (pollTimer) clearInterval(pollTimer);
	});
	pollTimer = null;
	fileSources.clear();

	safely("unregistering the pref observer", () => {
		if (prefObserver) Zotero.Prefs.unregisterObserver(prefObserver);
	});
	prefObserver = null;
	safely("unregistering the prefs pane", () => {
		if (prefPane) Zotero.PreferencePanes.unregister(prefPane);
	});
	prefPane = null;

	safely("clearing globals", () => {
		delete Zotero.LatexSuite;
		forgetOverrides();
	});
	contentScript = null;
	katexScript = null;
}

// Remote browsers need a complete document, not parent-process DOM insertion.

function install() {}
function uninstall() {}

// node-only: lets test.js check the defaults against src/settings/settings.ts.
if (typeof module !== "undefined") module.exports = { FIELDS, PREF };
