# Source conceal

Selected data tables from artisticat1/obsidian-latex-suite:
https://github.com/artisticat1/obsidian-latex-suite/blob/75411e8abfc1420441880b9b19c5513246498361/src/editor_extensions/conceal_maps.ts

MIT license retained in LICENSE.md. Upstream credits VimTeX and MathJax in
the preserved table header. Local changes remove configuration/schema code and
normalize TypeScript table types. No Obsidian or CodeMirror runtime is bundled.

The rule adapter in ../features/math_conceal.ts follows conceal_fns.ts at the
same revision: symbols, operators, alphabets, simple accents, formatted text,
scripts, negation and fraction display. It uses the existing tokenizer and a
balanced-group index rather than upstream's Lezer parser. It intentionally
does not hide limits/style controls, incomplete groups, or multiline forms.
Unknown content is not flattened. Compound forms reveal together. This is
not full parity with upstream (custom mapping configuration and bra/ket/set
handlers are not included).
