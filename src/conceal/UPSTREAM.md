# Source conceal

Selected data tables from artisticat1/obsidian-latex-suite:
https://github.com/artisticat1/obsidian-latex-suite/blob/75411e8abfc1420441880b9b19c5513246498361/src/editor_extensions/conceal_maps.ts

MIT license retained in LICENSE.md. Upstream credits VimTeX and MathJax in
the preserved table header. Local changes remove configuration/schema code and
normalize TypeScript table types. No Obsidian or CodeMirror runtime is bundled.

The rule adapter in ../features/math_conceal.ts follows conceal_fns.ts at the
same revision: symbols, operators, alphabets, formatted text,
scripts and negation. Fraction syntax deliberately remains visible;
its arguments still support conceal. It uses the existing tokenizer and a
balanced-group index rather than upstream's Lezer parser. It intentionally
does not hide limits/style controls, incomplete groups, or multiline forms.
Unknown content is not flattened. Compound forms reveal together. This is
not full parity with upstream (custom mapping configuration and bra/ket/set
handlers are not included).

The lifecycle follows conceal.ts at the same revision: source parsing is
cached separately from selection-driven reveal state. Our adapter additionally
retains identical decoration sets across unchanged reveal states. Appearance
metrics are refreshed outside decoration callbacks through coalesced DOM/resize
and theme notifications; all observers and composition listeners are cleaned up.
CodeMirror-specific atomic ranges and delayed reveal are not ported.

fonts.json records glyph availability from katex-zotero 0.16.22's
src/fontMetricsData.js for the Unicode characters in maps.ts. Prefer Main,
then AMS, then Math Italic; lowercase Greek prefers Math Italic. Characters
without a known glyph retain the source font. These are display-only font
choices. Large operators absent from those fonts use verified Size1-Regular
glyphs (compact operators, not display-size Size2), with the same 1.25 scale.
These are display-only font
choices, not a reproduction of KaTeX's full typesetting/font-selection logic.

Local semantic corrections follow bundled KaTeX: implies/impliedby/iff use
long arrows. mathcal and mathscr retain ASCII uppercase letters with explicit
Caligraphic-Regular and Script-Regular fonts respectively. mathbb likewise uses
ASCII uppercase letters in AMS-Regular rather than Unicode fallback glyphs; unsupported arguments
remain visible. Font identity participates in the decoration cache key.
Script glyphs reserve the final letter's italic correction from the bundled
KaTeX metrics, matching its combined SymbolNode margin-right behavior. The
margin is measured in the enlarged glyph's em, without inserting source spaces.
This is glyph correction, not full TeX superscript/subscript layout.

Braced vec/hat/bar/tilde/dot/ddot/dddot/ddddot/widehat/widetilde/overline accents use the
existing bundled KaTeX renderer, not Unicode approximations. Rendering is cached
by source (128 entries, 512 characters and 8 brace levels per expression), with
an allowed-command check, trust disabled, and bounded macro expansion. Script
groups containing these accents render at normal KaTeX style inside the existing
80%/vertical-offset wrapper, without applying script style a second time.
Both normal and script accent widgets include the same 1.25 font enlargement
as other KaTeX conceal glyphs (script size is 1.25 × 0.8 of the editor size).
Noneditable decorations reveal the original source when selected or clicked.
Malformed/unsupported forms stay visible; fractions are not flattened.
