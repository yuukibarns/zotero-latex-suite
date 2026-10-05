# Pinned Quiver source

https://github.com/varkor/quiver

Commit: 2f289ecbae9b7e5a473e04b924750c538ed5c4cf

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
