import { build } from 'esbuild';
import { extract } from '../modules/tikzcd/scripts/extract.mjs';
await extract();
await build({entryPoints:['modules/tikzcd/src/note-entry.mjs'],outfile:'modules/tikzcd/content/note.js',bundle:true,format:'iife',target:'firefox128',loader:{'.css':'text'},alias:{katex:'katex-zotero'}});
await build({entryPoints:['modules/backlinks/src/bootstrap.ts'],outfile:'modules/backlinks/bootstrap.js',bundle:true,format:'iife',globalName:'AnnotationBacklinks',target:'firefox128',footer:{js:'var startup=AnnotationBacklinks.startup; var shutdown=AnnotationBacklinks.shutdown;'}});
// Pure render/integration bundles support the imported regression tests.
for(const name of ['renderer','note-integration']) await build({entryPoints:[`modules/tikzcd/src/${name}.mjs`],outfile:`modules/tikzcd/build/${name}.mjs`,bundle:true,format:'esm',target:'firefox128',loader:{'.css':'text'},alias:{katex:'katex-zotero'}});
