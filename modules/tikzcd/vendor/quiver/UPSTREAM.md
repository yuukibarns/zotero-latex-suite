# Pinned Quiver source

https://github.com/varkor/quiver

The authoritative commit, upstream paths and SHA-256 hashes are recorded in
`modules/tikzcd/upstream.json`. Every build verifies these hashes offline.

From the repository root:

- `npm run quiver:check`: read-only comparison with upstream master; reports
  changes only to the vendored source, license and parser fixtures.
- `npm run quiver:update -- <full-sha> --dry-run`: download a candidate into a
  temporary directory, run extraction and the 45 diagram/integration tests,
  then discard it without modifying the snapshots.
- `npm run quiver:update -- <full-sha>`: same validation, then apply snapshots
  and hashes locally. Refuses dirty TikZ-CD files. Does not commit or push.

Review the diff and local parser adaptations; an upstream fix may make one
unnecessary. Run the full suite and native Zotero checks, including curves,
labels, cropping, both preview modes, and light/dark PDF export before release.
Passing unit tests is not visual approval. Failed extraction/testing leaves
tracked files untouched. `Check Quiver upstream` is a manual, read-only GitHub
Actions workflow; there is no automatic merge or runtime download.

These source files are unmodified snapshots, licensed under MIT (see LICENSE).
scripts/extract.mjs selects rendering methods with an AST and removes editor
dependencies. It fails if the expected upstream structure changes. No runtime
editor UI, window event handlers, remote CDN loaders, or Quiver application
startup are included in the resulting bundle.

Local adaptations: inert cell initialization; deterministic post-layout parser
finalization instead of a timer; warnings for ignored diagram spacing options;
bounded source/grid/cell inputs. See the extraction script and src/renderer.mjs.

Two narrowly scoped upstream fixes are applied during extraction: a marking
option must not consume a comma unless `pos=` follows (upstream valid fixtures
16 and 19 expose this); and an unreachable duplicate `multimap` switch case is
removed without changing behaviour. The upstream snapshots remain unchanged.
