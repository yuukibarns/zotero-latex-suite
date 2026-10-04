# Rendered math click → source caret

The previous implementation inserted preview markers at candidate positions,
rendered repeatedly and compared geometry. This was not an inverse mapping:
markers changed layout, numbers snapped to their start, literal characters hid
command candidates, and async placement produced a visible caret jump.

The replacement uses a private **KaTeX 0.16.22 source-map adapter**, matching
Zotero's bundled renderer. `scripts/katex-source-map.mjs` applies checked,
build-time hooks to the pinned dependency. It propagates lexer locations through
HTML-tree construction, preserves per-character locations during combination,
and relocates macro expansion tokens to their call site. The adapter generates
data only; it never inserts HTML or replaces Zotero's renderer. The bundled
KaTeX license covers this copy as well.

Related upstream work (still proposed, not a supported public API):

- https://github.com/KaTeX/KaTeX/pull/4226
- https://github.com/KaTeX/KaTeX/pull/4295

On a plain click, build/cache the unchanged equation's glyph map. Match its full
glyph sequence against native `.katex-html` before using any offsets. Actual
native text ranges determine the clicked character and which side of it was
clicked. Fractions/matrices use **rendered DOM order**, not source order. A
command-generated glyph maps to the command's boundaries; ordinary digits and
letters retain individual UTF-16 ranges.

A one-shot hook lets native `MathView.openEditor` run, then applies the target
selection synchronously **before that call returns to the browser**. There is
no animation-frame search, hidden probe, delayed correction or suppressed
native click. Internally native still initializes its selection normally, but
that intermediate position is never painted. Drag/modifier/input cancellation,
method restoration and teardown remain intact.

Release targets are not required to remain inside the math DOM. Gecko can
retarget a stationary mouseup to the surrounding editor, while ProseMirror
still opens the math node using its saved mousedown position. Rejecting that
release discarded a valid mapping in .90. The regression harness exercises
ancestor-targeted releases with trusted Gecko input and checks placement from
both the start and end. Movement/modifiers still cancel; only the original
node's actual native opening can consume the mapping.

Maps are weakly cached by native HTML root plus source. Rerendering or changing
the source invalidates the map; caches do not retain closed editors. Unsupported
source locations, SVG-only shapes (e.g. a radical's stroke), parse errors and
renderer mismatches use Zotero's normal start/end placement. No fuzzy fallback.

Upgrade guard: the adapter fails the build unless the dependency is the reviewed
version and every hook matches exactly once. When updating KaTeX or Zotero,
review those hooks and rerun `test-math-caret.mjs` plus the actual Zotero harness.
The latter uses a disposable profile, synthetic notes and trusted Gecko input,
and checks the first animation frame as well as the eventual caret position:

```
npm run build && npm run typecheck && npm test
python scripts/package-local.py ../../outputs/latex-suite-completion-<version>.xpi
node test-zotero-caret.mjs
```

`CARET_XPI` can select another packaged build. The standalone preview marker is
unchanged and no longer participates in click-to-source mapping.
