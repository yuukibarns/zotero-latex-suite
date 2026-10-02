# Pinned Highlight.js LaTeX fixtures

Source: [Highlight.js LaTeX markup tests](https://github.com/highlightjs/highlight.js/tree/fc3f06392f189354eed922973635ab9e9268b983/test/markup/latex)
at commit `fc3f06392f189354eed922973635ab9e9268b983`.

The `.txt` inputs and `.expect.txt` HTML outputs are vendored under the
BSD-3-Clause license in `HIGHLIGHTJS-LICENSE`. Trailing whitespace at end of
each file was normalized to one final newline; internal whitespace and token
markup are unchanged.

Our tests compare command/parameter spans directly with expected markup.
Other fixtures document useful edge cases rather than asserting our
equation-only scanner reproduces every full-document grammar feature.
See `notes/highlight-rules.md` for adaptations and intentional differences.
