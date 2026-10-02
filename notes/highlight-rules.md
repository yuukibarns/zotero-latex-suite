# Equation highlighting: upstream references

The equation scanner remains dependency-free and uses UTF-16 offsets for
ProseMirror decorations. It does not load Highlight.js or CodeMirror at runtime.

Recognition rules in `src/highlight/rules.ts` are adapted from:

- [Highlight.js LaTeX grammar](https://github.com/highlightjs/highlight.js/blob/fc3f06392f189354eed922973635ab9e9268b983/src/languages/latex.js),
  by Benedikt Wilde, pinned to `fc3f06392f189354eed922973635ab9e9268b983`:
  control words (including `@`), LaTeX3 control sequences, encoded `^^`
  characters, and macro parameters. Licensed BSD-3-Clause; see
  `HIGHLIGHTJS-LICENSE`.
- [CodeMirror stex mode](https://github.com/codemirror/legacy-modes/blob/ca1becfc97b36d461f77cf631b95b80185fdfb3a/mode/stex.js),
  pinned to `ca1becfc97b36d461f77cf631b95b80185fdfb3a`: decimal/integer
  recognition. Licensed MIT; see `CODEMIRROR-LICENSE`.

The rules use sticky regex matching at the scanner's current position. Our
existing text/math context stack, verbatim handling, and decoration lifecycle
remain in place. This adapts recognition rules, not a full-document grammar.

## Verification

Pinned Highlight.js fixtures live in `test-fixtures/highlightjs-latex`.
Tests compare exact command and parameter offsets against upstream expected
HTML markup, exercise upstream comments and a verbatim example, and test our
text/math transitions, malformed input, Unicode offsets, and lifecycle.

## Intentional differences and limits

- This is equation-source coloring, not a TeX interpreter, parser, or linter.
  Unknown commands are colored, not validated. Catcode changes and expansion
  are not evaluated; `^^` escapes are recognized but not decoded.
- Numeric literals get a separate color, following CodeMirror. Highlight.js
  does not assign them a separate token in this grammar.
- Encoded characters have an explicit escape color, unlike Highlight.js's
  unstyled encoded-character matches. Magic editor comments remain comments,
  not separate document metadata tokens.
- Full-document constructs such as `minted`, `lstlisting`, `mintinline`, URL
  bodies, and verbatim environments are outside this equation-only scanner.
  The vendored fixtures do not imply complete support for these constructs.
- Coloring never changes stored source, the note schema, or undo history.

Both upstream license notices are included in local and release XPI packages.
