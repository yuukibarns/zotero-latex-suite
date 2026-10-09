# pseudocode.js

Selected MIT-licensed sources from https://github.com/SaswatPadhi/pseudocode.js
at commit `1fbd17c0100f50f26fc76868607654a2091d28bf` (2.4.1).
The pristine vendor snapshot contains Lexer, Parser, Renderer, ParseError,
utils, the stylesheet, and LICENSE. No Obsidian UI or MathJax is included.

The build removes only automatic global backend discovery from Renderer;
our adapter supplies local KaTeX with trust disabled and bounded expansion.
It also declares upstream's undeclared attrVal, ifCond, and uponCond temporaries
for strict-mode safety.
The stylesheet's CDN import is removed at runtime. Layout otherwise belongs
to upstream. This supports pseudocode.js syntax, not arbitrary algorithm2e
or all algorithmicx extensions.
