import { build } from 'esbuild';
import { extract } from '../modules/tikzcd/scripts/extract.mjs';
import { readFile } from 'node:fs/promises';
import { verify } from './quiver-upstream.mjs';
// The adapter supplies local KaTeX; omit upstream global backend discovery.
const pseudocodeBackend = { name:'pseudocode-backend', setup(build) {
  build.onLoad({filter:/pseudocode\/vendor\/src\/Renderer\.js$/}, async ({path}) => {
    const source = await readFile(path, 'utf8');
    const start = source.indexOf('    this.backend = undefined;');
    const end = source.indexOf('\n}\n', start);
    if (start < 0 || end < 0) throw new Error('Review changed pseudocode backend');
    return {contents:source.slice(0,start) + '    this.backend = undefined;' + source.slice(end), loader:'js'};
  });
} };
for (const [entry, outfile, format] of [
  ['note-entry','content/note.js','iife'], ['renderer','build/renderer.mjs','esm']
]) await build({entryPoints:['modules/pseudocode/src/'+entry+'.mjs'], outfile:'modules/pseudocode/'+outfile, bundle:true,format,target:'firefox128',loader:{'.css':'text'},plugins:[pseudocodeBackend]});
await verify(JSON.parse(await readFile(new URL('../modules/tikzcd/upstream.json',import.meta.url),'utf8')));
await extract();
await build({entryPoints:['modules/tikzcd/src/note-entry.mjs'],outfile:'modules/tikzcd/content/note.js',bundle:true,format:'iife',target:'firefox128',loader:{'.css':'text'},alias:{katex:'katex-zotero'}});
await build({entryPoints:['modules/backlinks/src/bootstrap.ts'],outfile:'modules/backlinks/bootstrap.js',bundle:true,format:'iife',globalName:'AnnotationBacklinks',target:'firefox128',footer:{js:'var startup=AnnotationBacklinks.startup; var shutdown=AnnotationBacklinks.shutdown;'}});
// Pure render/integration bundles support the imported regression tests.
for(const name of ['renderer','note-integration']) await build({entryPoints:[`modules/tikzcd/src/${name}.mjs`],outfile:`modules/tikzcd/build/${name}.mjs`,bundle:true,format:'esm',target:'firefox128',loader:{'.css':'text'},alias:{katex:'katex-zotero'}});
