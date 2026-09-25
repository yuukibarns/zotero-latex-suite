/** Print-only typography; deliberately independent of editor UI rules. */
export const PRINT_STYLES = `
:root { color-scheme: light; --paper: #fff; --ink: #20242b; --rule: #d2d7df; --panel: #f0f3f6; --code: #f3f5f7; }
:root[data-theme="dark"] { color-scheme: dark; --paper: #202124; --ink: #e6e8eb; --rule: #50545c; --panel: #2d3036; --code: #2b2e33; }
html { background: var(--paper); color: var(--ink); print-color-adjust: exact; }
body { margin: 0; background: var(--paper); }
.primary-editor {
  max-width: 54rem; margin: 0 auto; padding: 16mm 18mm;
  box-sizing: border-box; box-decoration-break: clone;
  font-family: Georgia, "Noto Serif", "Times New Roman", serif;
  font-size: 11pt; line-height: 1.45;
  overflow-wrap: break-word; white-space: normal;
}
.primary-editor p { margin: 0 0 .7em; orphans: 3; widows: 3; }
.primary-editor h1, .primary-editor h2, .primary-editor h3,
.primary-editor h4, .primary-editor h5, .primary-editor h6 {
  font-family: system-ui, sans-serif; line-height: 1.25;
  margin: 1.65em 0 .6em; break-after: avoid; page-break-after: avoid;
}
.primary-editor h1 { font-size: 21pt; letter-spacing: -.025em; margin-top: 0; }
.primary-editor h2 { font-size: 15pt; }
.primary-editor h3 { font-size: 12.5pt; }
.primary-editor h4, .primary-editor h5, .primary-editor h6 { font-size: 11pt; }
.primary-editor > :first-child { margin-top: 0; }
.primary-editor ul, .primary-editor ol { padding-inline-start: 1.6em; margin: .5em 0 1em; }
.primary-editor li { margin: .25em 0; }
.primary-editor li > p { margin-bottom: .3em; }
.primary-editor blockquote {
  margin: 1.1em 0; padding: .15em 0 .15em 1em;
  border-inline-start: 2px solid var(--rule);
}
.primary-editor blockquote > :last-child { margin-bottom: 0; }
.primary-editor a { color: inherit; text-decoration: underline; text-underline-offset: .15em; }
.primary-editor hr { border: 0; border-top: 1px solid var(--rule); margin: 1.6em 0; }
.primary-editor table { width: 100%; border-collapse: collapse; margin: 1.1em 0; font-size: .95em; }
.primary-editor th, .primary-editor td { padding: .5em .65em; border: 1px solid var(--rule); vertical-align: top; }
.primary-editor th { background: var(--panel); font-weight: 600; }
.primary-editor td > :last-child, .primary-editor th > :last-child { margin-bottom: 0; }
.primary-editor thead { display: table-header-group; }
.primary-editor tr { break-inside: avoid; page-break-inside: avoid; }
.primary-editor img { max-width: 100%; height: auto; object-fit: contain; break-inside: avoid; }
.primary-editor pre, .primary-editor code { font-family: "Noto Sans Mono", monospace; font-size: .88em; }
.primary-editor pre { padding: .85em 1em; background: var(--code); white-space: pre-wrap; overflow-wrap: anywhere; }
.primary-editor code { background: var(--code); padding: .1em .2em; }
.primary-editor pre code { padding: 0; background: none; }
.primary-editor .katex { font-size: 1.08em; }
.primary-editor .ls-print-display { margin: 1.15em 0; break-inside: avoid; page-break-inside: avoid; }
.primary-editor .katex-display { margin: 0; }
.primary-editor .ProseMirror-separator, .primary-editor .ProseMirror-gapcursor { display: none; }
@page { margin: 0; }
@media print {
  .primary-editor { max-width: none; }
  .primary-editor { print-color-adjust: exact; }
}
`;
