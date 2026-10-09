Command data derived from tth05/obsidian-completr at 400fb99279345f8f7424ef58a6076e7a93ac5fdc.
Source: https://raw.githubusercontent.com/tth05/obsidian-completr/400fb99279345f8f7424ef58a6076e7a93ac5fdc/src/provider/latex_provider.ts
License: MIT; see COMPLETR-LICENSE.
Validated against KaTeX 0.16.22 (Zotero installed editor).
747 entries accepted using fixtures.json (743 upstream entries plus 4 local additions).
Local additions: limits, nolimits, operatorname*, and middle, validated in their required math contexts. The generator preserves these additions.
Regenerate: node scripts/completion-data.mjs (prints an apply_patch patch).
Local adaptation: array/subarray templates place the final cursor stop inside the body after the column-specification placeholder.

Pseudocode additions live separately in pseudocode.json so regeneration preserves
them. They target the bundled pseudocode.js algorithm/algorithmic grammar, not
KaTeX. Environment and control-flow templates include argument/body jump stops.
