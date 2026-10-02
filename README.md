# LaTeX Suite for Zotero

Completion fork maintained by **yuukibarns**, based on
[Pavel Ievlev's Zotero LaTeX Suite](https://github.com/ievlevpn/zotero-latex-suite).
Original licenses and attribution are retained, including Obsidian LaTeX Suite
and Completr contributions.

## Fork builds and releases

GitHub Actions typechecks, builds, tests, and uploads a `latex-suite-completion`
artifact on pushes to `master` and `feat/**`, and on pull requests. Download the
artifact from the workflow run and extract the XPI to install it.

For a public release, set `manifest.json`'s version, commit it, and push a matching
`v<version>` tag to this fork. CI publishes the XPI and SHA-256 checksum as GitHub
Release assets only after all checks pass. Use this workflow rather than the
original upstream `release.sh`. Packaged previews use the fork's empty update
feed; publishing a release does not yet enable automatic in-app updates.

**Write LaTeX in your PDF annotations and see it rendered as you type.** Zotero
renders equations in notes but not in annotation comments, where most reading
notes actually get written — so a comment reading `the bound $\|x\|_2 \leq 1$
holds` stays as raw source. This plugin renders it, live, in the reader sidebar,
the in-page popups, and the item pane.

It also brings the snippets from
[Obsidian Latex Suite](https://github.com/artisticat1/obsidian-latex-suite) to
both annotations and notes, so the LaTeX is quick to type in the first place:

```
mk          →  inline equation
dm          →  display equation
x/y  Tab    →  \frac{x}{y}
@t          →  \theta
sqx         →  \sqrt{x}
dint Tab 2pi Tab sin @t Tab @t Tab  →  \int_{0}^{2\pi} \sin \theta \, d\theta
```

The snippet format is unchanged from upstream, so if you already use
obsidian-latex-suite you can point this at the very same file and get the same
shortcuts in both — see [Sharing snippets with Obsidian](#sharing-snippets-with-obsidian).
It ships with Latex Suite's [default snippets](src/default_snippets.js) — 220-odd
of them — which you can edit, remove or replace in **Settings → LaTeX Suite**.

## Install

Download `latex-suite.xpi` from the
[latest release](https://github.com/ievlevpn/zotero-latex-suite/releases/latest)
→ Zotero → Tools → Plugins → ⚙ → Install Plugin From File… Updates are automatic.

## Features

### Note equation completion (local extension)

Inside an inline or display equation, type `alp` (or `\alp`) to suggest
`\alpha`. Suggestions appear after typing two letters; moving the cursor into
existing text does not open the menu. Fuzzy matching also accepts skipped
letters, such as `aph` for `\alpha`, while prioritizing prefix and contiguous
matches over scattered matches. Up/Down select, Enter accepts,
Escape dismisses, and Tab retains the existing snippet/tabstop behavior.
Shift+Enter dismisses suggestions and passes Enter through to the editor.
Completions such as `\frac{#}{#}` insert argument tabstops; use Tab/Shift+Tab
to fill them. Your custom snippet expansions still run before completion updates.

Settings → LaTeX Suite → Completion lets you disable completion, change the
minimum prefix length, or select a custom Completr `latex_commands.json` file.
Enable “Load custom completion dictionary” to use that file instead of the defaults.
Files are polled for changes. Invalid files retain the last valid dictionary;
the settings pane displays the load error. After restarting, an invalid file
falls back to built-in commands until corrected.

The bundled 743 entries are derived from Completr and validated against
KaTeX 0.16.22, as bundled in the inspected Zotero 10 installation. Custom files
may include commands the renderer does not support. See
`src/completion/PROVENANCE.md` and `COMPLETR-LICENSE` for source attribution.
LaTeX command completion is limited to note equations.

### LaTeX source highlighting

Note equations now color commands, braces, operators, comments and environment
names while editing, with light/dark-aware colors. Nested text arguments such as
`\text{target {label}}` are tracked without affecting subsequent math.
Settings → LaTeX Suite → Completion → **Highlight LaTeX source in note equations**
toggles this independently of snippets, completion and live preview.
Inside text macros, nested `$…$` or `\(…\)` regions are math mode for snippets
and completion. For an automatic `mk` entry in `\text{…}`, add
`{trigger: "mk", replacement: "\\($0\\)$1", options: "TA"}` to your custom
snippets. This inserts nested LaTeX, not a second Zotero math node. Closing the
delimiter restores text mode; closing the text group restores outer math mode.
Highlighting uses temporary ProseMirror decorations: stored LaTeX, history and
exported math remain unchanged. Annotation editors are not included.

Highlighting uses a lightweight hand-written equation-source tokenizer, with
no TextMate, WASM, network dependency or asynchronous runtime initialization.
Cursor movement reuses cached decorations. The scanner handles ordinary math
commands, escapes, nested text arguments and environment names; it is not a full
TeX parser. The ProseMirror utilities retain their MIT license in
`PROSEMIRROR-LICENSE`.
The scanner also handles math nested in text arguments (`$…$`, `\(…\)` and
`\[…\]`), starred `\operatorname*`, verbatim `\verb`/`\verb*`, and escaped
Unicode characters. Unfinished inner math is contained when its surrounding text
group closes. Highlighting updates do not repeatedly rescan the whole editor.
Run `node benchmark-math-highlight.mjs` after building to measure tokenization
and decoration creation; it does not measure browser layout or painting.

`\left`, `\middle`, and `\right` use rose, distinct from teal environment names.
With a collapsed selection, placing the caret before/after a delimiter or
inside a named delimiter command highlights its partner(s) with a subtle
background. Scalable commands include the complete command-plus-delimiter;
`\middle` highlights the surrounding `\left`/`\right` group. Unmatched
delimiters get a wavy warning underline. Comments, literal text commands and
ambiguous bare bars are excluded. Range selections clear the matching cue.
The shared delimiter map is cached until source changes; caret movement uses
a direct lookup and never changes source or undo history. This feature follows
the source-highlighting toggle.
Recognition rules adapted from Highlight.js and CodeMirror are documented in
`notes/highlight-rules.md`, with their license notices included in the XPI.

### Expand selection inside equations

While editing inline or display math, single clicks place the caret and double
clicks select a word or command using the plugin's selection handler. A third click at the same position selects
the nearest enclosing expression; further rapid clicks expand outward. For
example: `a` → `a+b` → `\frac{a+b}{c}` → whole equation source.
Plain left-click selection (including dragging) is handled by the plugin only
inside editable math; native mousedown/release/click/double-click selection is
suppressed there to avoid competing selection handlers.
No keyboard shortcut is assigned; click again normally to restart selection.
The plugin tracks click continuation itself (within 1000 ms by default
and 5 CSS pixels), so browsers that restart their native click count do not
restart selection. Mouse release/click handlers protect the structural extent
from native line selection. Moving the click position or pausing starts over.
Adjust **Settings → LaTeX Suite → Math selection → Repeated-click timeout**
to change the maximum pause between clicks (200–5000 ms). Changes apply without
restarting Zotero; reloading settings resets any in-progress click sequence.
Delimiter regions have both inside and outside levels: `a` → `a+b` → `(a+b)`
→ enclosing expression. This also applies to `{…}`, `[…]`, named pairs,
and complete `\left … \right` expressions.

Supported regions include braces, parentheses, square brackets, escaped braces,
`\langle … \rangle`, named absolute-value/norm/floor/ceiling pairs, `|…|`,
`||…||`, `\|…\|`, and `\left … \right` with optional `\middle`.
Common braced constructs such as fractions also form whole-command regions.
Any alphabetic command followed by complete braced arguments forms a region,
so custom macros need no whitelist: `\mycommand{a}{b}_{i}` works too.
Structural commands and delimiter commands are excluded. A small signature
table keeps incomplete fractions/binomials from becoming half-command regions.
Optional `[…]` arguments and unbraced arguments are not guessed.
Styled symbols (`\mathcal`, `\mathbb`, `\mathbf`, etc.) also form command
regions, followed by a whole-term level including attached sub/superscripts:
`L` → `{L}` → `\mathcal{L}` → `\mathcal{L}_{\text{SE}}` → enclosing expression.
Accents and decorations (`\dot`, `\ddot`, `\vec`, `\hat`, `\widehat`,
`\tilde`, `\widetilde`, bars/arrows/braces, etc.) use the same braced-argument
selection levels, including nested accents and attached scripts.
Comments and verbatim/text bodies do not create delimiter pairs. Symmetric bars
use a conservative same-nesting-level heuristic, not semantic TeX parsing;
ambiguous mathematical notation may still require manual selection.
Incomplete/mismatched pairs are skipped. Editing source, moving the selection,
switching equations, or reloading settings resets selection history. Tab navigation
is unchanged. Modified clicks, right clicks, and IME composition are left alone.

### Annotation completion and preview options

### Ordinary-text completion

The note editor supports scrolling beyond the last line: approximately one
viewport of editor-only bottom padding lets the final line reach the top.
Spacing follows the scroll-container size and is removed when the plugin is
disabled. It does not add paragraphs or alter saved notes or PDF export.

Typing a word in ordinary note text automatically offers current-note (Buffer)
and custom word-list (Dictionary) suggestions after the configured minimum
prefix length, default two. Both sources have independent switches in Settings
→ LaTeX Suite → Completion. Dictionary completion requires selecting a **Word
dictionary file**: UTF-8 plain text, one word or phrase per line. Blank lines and
duplicates are ignored. Like [Completr's word-list provider](https://github.com/tth05/obsidian-completr/blob/400fb99279345f8f7424ef58a6076e7a93ac5fdc/src/provider/word_list_provider.ts),
matching uses case-insensitive prefixes; exact case and shorter words rank first
within each source. Buffer results precede dictionary results, with duplicates
removed. No dictionary data or Obsidian runtime is bundled or downloaded.

The shared popup shows the source below each word. Up/Down select, Enter inserts,
Escape dismisses; Tab and Shift+Enter dismiss without being consumed. Suggestions
only appear after input, at the end of a word with a collapsed selection, outside
math and code. Buffer indexing reuses unchanged ProseMirror blocks and drops
deleted words. Dictionary lookup uses a sorted prefix index; only 50 merged
results are displayed. Changing the dictionary file reloads it through the
existing privileged settings pipeline; unreadable files retain the last good
contents and report an error in settings.

In ordinary note text, type `@@query` to search annotations throughout the
note's library. Search starts after the configured minimum completion prefix
length (default two characters, excluding `@@` and surrounding whitespace).
Below that threshold no cache loading or matching runs. Search covers annotation
text and comments. The first configured number of query characters must
match as a literal substring (case-insensitive). All matching candidates are
retained, then the full query is fuzzy-matched within that set as you type.
Only the displayed results are capped at 50; changing the initial characters
or annotation updates invalidates the applicable candidate set.
Results are ranked by match quality without preferring comments. Suggestions
show annotation text and comment on one line, with the source title dimmed below.
Note/area annotations with no text remain searchable through their comments.
Up/Down navigate, Enter inserts, Escape
dismisses, and Tab dismisses without being consumed. Math and code are excluded.
Standalone notes search their library too. A shared session cache reads searchable
fields directly from SQLite on first use. Item notifications queue incremental
refreshes before the next search, including parent trash/restore and title edits.
Search is debounced by 120 ms, yields during long scans, and returns at most 50
results to the editor. Cached records retain text/comment, the displayed source
title, and IDs needed for library isolation and incremental invalidation—not
images, annotation type/page, full item objects, or duplicated search strings. Initial load
and refresh timings appear in Zotero debug output; no separate disk cache is used.

Insertion replaces the query with literal annotation text, falling back to its
comment if the text is empty. No citation, source link, or image is inserted.
If both are empty, an error is shown instead of deleting the query. Annotation color and citation settings
are left unchanged. A result whose note selection changed during loading is
not inserted.

Settings → LaTeX Suite → Completion has separate **Live preview for inline math**
and **Live preview for display math** toggles. The previous shared setting is
used for both until you change them. Both share the existing debounce setting.

Run `npm run typecheck`, `npm run build`, and `npm test` to validate the extension.

### Existing features

### Pasting ChatGPT math

Pastes whose plain-text representation contains `\(...\)`, `\[...\]`, `$...$`, or
`$$...$$` are imported with native equation nodes, including simple math such as
`$n$` and `$1$`. Zotero's Markdown importer handles the surrounding text; temporary
markers are replaced in a staged transaction before anything enters the note.
Code spans, fenced and indented code, escaped dollars, and unmatched delimiters
are left alone. Dollar delimiters use conservative whitespace rules to avoid
common currency cases, though dollar notation is inherently ambiguous.
Pasting into an equation or code block retains normal behavior. Browser clipboard
content can include both HTML and text: when convertible math is found, the text
is imported as Markdown, so HTML-only styling is not retained. Without convertible
math, rich HTML paste is unchanged. Image/annotation pastes are not intercepted.
Conversion uses private Zotero editor
internals and falls back to normal paste if its Markdown importer is unavailable.

- **Live rendering in annotations** — `$…$` and `$$…$$` in a comment are drawn
  as you write, everywhere annotations appear. The equation the cursor is inside
  stays as source so you can keep editing it; click a rendered one to get back
  into it.
- **Snippets** — triggers, tabstops with placeholders, regex triggers, visual
  (selection-wrapping) snippets, function replacements, snippet variables,
  priorities. The format and every option letter are unchanged, so
  [Latex Suite's DOCS.md](https://github.com/artisticat1/obsidian-latex-suite/blob/main/DOCS.md#snippets)
  is the reference.
- **Auto-fraction** — `x/` becomes `\frac{x}{}`, brackets and greek letters
  included.
- **Tabout** — <kbd>Tab</kbd> at the end of an equation leaves it; otherwise it
  advances past the next closing bracket.
- **Matrix shortcuts** — inside `pmatrix`, `cases`, `align` and friends,
  <kbd>Tab</kbd> adds a cell, <kbd>Enter</kbd> a row, <kbd>Shift</kbd>+<kbd>Enter</kbd>
  leaves. <kbd>Ctrl</kbd>+<kbd>Enter</kbd> inserts a source newline without `\\`.
  These keys can be changed in Settings → LaTeX Suite → Matrix shortcuts.
- **Auto-enlarge brackets** — a bracket pair containing `\sum`, `\int`, `\frac`…
  grows a `\left`/`\right`.

### Annotations

Snippets and rendering also work in PDF/EPUB **annotation comments**. Those are
plain text, so there an equation is `$…$` / `$$…$$` exactly as in Obsidian —
which is also what makes it portable: it survives sync and export, and "Add Note
from Annotations" turns it into a real equation in the note.

`$…$` renders as you write. Every equation in the comment is drawn except the
one the cursor is inside, which stays as source so you can keep editing it —
click a rendered equation to get back into it. Works in the reader sidebar, the
in-page popups, and the item pane's annotation list.

Typing does not disturb the equations you are not editing. Zotero reads a
comment back out of its own DOM on every keystroke, so the rendering has to come
out of the way first; it goes back in during the same event, before the browser
paints, and from a cache keyed on the LaTeX source — so an equation only goes
through KaTeX again when its source actually changes.

Rendering is via KaTeX's MathML output, which Firefox draws natively, so the
plugin ships no fonts. Inline `$…$` has to look like an equation and not like
"$5 and $10", so a dollar pair with a space just inside it is left alone.

## How it maps onto Zotero

Zotero notes aren't markdown: an equation is a node in the note, and its LaTeX
source is edited in its own little editor, rendered live with KaTeX. That makes
most of the mapping easy and one part interesting:

- **Math mode is structural.** `m`/`n`/`M` mean "the cursor is in an equation
  node", not "the cursor is between `$` signs". No `$` scanning, no ambiguity.
- **`$…$` in a text-mode replacement creates an equation.** That is what
  Latex Suite's `mk` and `dm` snippets mean, so they work unchanged: `mk` gives
  an inline equation, `dm` a display one, with the tabstops inside it.
- **`t` (text mode) is the note itself** — paragraphs, headings, list items.
- **`c` / `C` (code) is a Zotero code block.**
- **In annotations none of that applies** — they hold plain text, so math is
  found by scanning for `$` the way Latex Suite does.

Features that only made sense against markdown are not here: conceal, inline
math preview, and bracket colouring all exist to show you what your `$…$` means,
and Zotero already renders the equation as you type.

### Compatibility

The snippet format is the promise this plugin makes, so every example in
[Latex Suite's DOCS.md](https://github.com/artisticat1/obsidian-latex-suite/blob/main/DOCS.md)
is a test — see `test-compat.mjs`. That covers tabstops and placeholders,
same-index tabstop groups, regex triggers by option and by literal, flags,
snippet variables in all three spellings, visual snippets as strings and as
functions, function replacements (including returning `false` to decline), the
`require("latex-suite")` node API with named capture groups, priority and
trigger-length ordering, every option letter, `excludedEnvironments` /
`excludedMacros` / `includedMacros`, the `.md`-wrapped snippet file format, and
folders of snippet files.

Where it deliberately differs:

- **Tabstops that share a number** are all inserted, but only the first is
  selected. Latex Suite puts a cursor in each; neither editor here has more than
  one selection.
- **The `U` option is inert.** Undo of an automatic expansion is one step: it
  restores what you had before the trigger rather than the trigger itself.
- **`language` and code-block modes are limited.** A Zotero code block carries no
  language, so a snippet with `language: "python"` can never match; plain `c` and
  `C` work.
- **Conceal, inline math preview and bracket colouring are absent**, as above:
  Zotero already renders the equation.

## Layout

Mirrors obsidian-latex-suite's, minus what does not apply:

```
bootstrap.js            chrome side: settings pane, and injecting the engine
                        into each note-editor iframe
src/
  main.ts               keymap, in DOCS.md#keymap-order
  default_snippets.js   the shipped snippets, copied verbatim from upstream
  editor/               what replaces CodeMirror: a flat string and a cursor
    buffer.ts           the contract, and its two backends
    pm.ts               ProseMirror, for notes
    contenteditable.ts  plain contenteditable, for annotation comments
    insert_math.ts      `$…$` in text mode -> an equation node (notes only)
  reader/annotations.ts rendering `$…$` in the reader
  render/math.ts        KaTeX -> MathML, shared with the item pane
  snippets/             parse.ts, snippets.ts, options.ts, tabstop.ts,
                        snippet_management.ts, sort.ts, luasnip_api/
  features/             run_snippets, autofraction, tabout, matrix_shortcuts,
                        auto_enlarge_brackets
  settings/settings.ts  defaults, and compiling them for the engine
  utils/                context.ts (where the cursor is), tokenizer, brackets
notes/                  what the Zotero note editor looks like from inside
```

## Development

```sh
npm install
npm run build     # -> build/content-script.js
npm run watch
node test.js      # engine self-check, outside Zotero
```

To run it from a checkout, point Zotero at the folder: create a file named
`latex-suite@ievlevpn.github.io` in `<profile>/extensions/` containing the absolute path
to this directory, then restart Zotero.

`./release.sh` builds, tests, tags and publishes.

## Credits and license

The snippet engine, the snippet format, and the default snippets are ported from
[artisticat1/obsidian-latex-suite](https://github.com/artisticat1/obsidian-latex-suite)
by artisticat1, which in turn follows
[Gilles Castel's UltiSnips setup](https://castel.dev/post/lecture-notes-1/). The
annotation rendering, and everything that makes any of it work against Zotero's
editors, is this project's.

Unaffiliated with obsidian-latex-suite and not endorsed by it. Please don't take
bug reports there for anything that only happens here.

MIT, for both the original and this port — see [LICENSE](LICENSE).
