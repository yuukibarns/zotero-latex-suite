// Prints an apply_patch patch; does not write files. Pinned upstream data only.
import vm from 'node:vm';
const revision = '400fb99279345f8f7424ef58a6076e7a93ac5fdc';
const base = `https://raw.githubusercontent.com/tth05/obsidian-completr/${revision}/`;
async function get(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status}: ${url}`); return r.text(); }
const source = await get(base + 'src/provider/latex_provider.ts');
const license = await get(base + 'LICENSE');
// Validate against the version verified in the installed Zotero note editor.
const context = { module: { exports: {} }, exports: {} };
vm.runInNewContext(await get('https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.js'), context);
const katex = context.module.exports;
const commands = [...source.matchAll(/Suggestion\.fromString\(("(?:[^"\\]|\\.)*")\)/g)].map(m => {
 const s = JSON.parse(m[1]); return { displayName: s, replacement: s };
});
for (const m of source.matchAll(/\{ name: "([^"]+)", paramCount: (\d+), hasStarVersion: (true|false) \}/g)) {
 for (const name of m[3] === 'true' ? [m[1], m[1]+'*'] : [m[1]]) {
  const n = Number(m[2]); commands.push({ displayName: `\\begin{${name}}...`, replacement: `\\begin{${name}}${'{#}'.repeat(n)}\n${n ? '' : '~\n'}\\end{${name}}` });
 }
}
const fixtures = {
 '\\hline': '\\begin{array}{c}x\\\\\\hline y\\end{array}',
 '\\above{#}{#}': '{x \\above 1pt y}',
 '\\left\\': '\\left\\backslash x\\right.',
 '\\right\\': '\\left. x\\right\\backslash',
};
function sample(c) {
 if (fixtures[c.replacement]) return fixtures[c.replacement];
 let s = c.replacement.replace(/(?<!\\)#/g, 'x').replace(/~/g, 'x');
 s = s.replace(/(\\begin\{(?:array|subarray)\})\{x\}/g, '$1{c}')
      .replace(/(\\begin\{(?:alignedat|alignat\*?)\})\{x\}/g, '$1{2}')
      .replace(/(\\(?:color|colorbox|fcolorbox)\{)x\}/g, '$1red}')
      .replace(/\\fcolorbox\{red\}\{x\}/g, '\\fcolorbox{red}{blue}');
 if (s.includes('\\begin') && !s.includes('x')) s = s.replace('\n', '\nx\n');
 return s;
}
const accepted = commands.filter(c => {
 try { katex.renderToString(sample(c), { throwOnError: true, displayMode: true, strict: 'ignore', trust: false }); return true; }
 catch { return false; }
});
const files = {
 'src/completion/commands.json': JSON.stringify(accepted, null, 2)+'\n',
 'src/completion/fixtures.json': JSON.stringify(Object.fromEntries(accepted.map(c => [c.displayName, sample(c)])), null, 2)+'\n',
 'COMPLETR-LICENSE': license,
 'src/completion/PROVENANCE.md': `Command data derived from tth05/obsidian-completr at ${revision}.\nSource: ${base}src/provider/latex_provider.ts\nLicense: MIT; see COMPLETR-LICENSE.\nValidated against KaTeX 0.16.22 (Zotero installed editor).\n${accepted.length} of ${commands.length} entries accepted using fixtures.json.\nRegenerate: node scripts/completion-data.mjs (prints an apply_patch patch).\n`,
};
console.log('*** Begin Patch');
for (const [path, value] of Object.entries(files)) console.log(`*** Add File: ${path}\n` + value.trimEnd().split('\n').map(s=>'+'+s).join('\n'));
console.log('*** End Patch');
