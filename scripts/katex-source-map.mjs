// Build-time adapter for the exact KaTeX version used by Zotero's editor.
// Source-range propagation follows the approach discussed in KaTeX PRs
// https://github.com/KaTeX/KaTeX/pull/4226 and /4295 (not yet public APIs).
// This private copy produces data only: it never replaces Zotero's renderer.
import fs from 'node:fs/promises';
import esbuild from 'esbuild';

export async function buildKatexSourceMap() {
 let source = await fs.readFile('node_modules/katex-zotero/dist/katex.mjs', 'utf8');
 const {version} = JSON.parse(await fs.readFile('node_modules/katex-zotero/package.json', 'utf8'));
 if (version !== '0.16.22') throw new Error('Review source-map adapter before upgrading KaTeX');
 function replace(before, after) {
  if (source.split(before).length !== 2) throw new Error('KaTeX source-map hook changed: '+before);
  source = source.replace(before, after);
 }
 // Keep each glyph's range even when KaTeX combines adjacent text nodes.
 replace('prev.text += next.text;', 'prev.lsRanges = lsRanges(prev).concat(lsRanges(next)); prev.text += next.text;');
 replace('return groupNode;\n  } else {', 'lsLocate(groupNode, group.loc || group.base?.loc); return groupNode;\n  } else {');
 // Function handlers often omit loc; the command token is the correct boundary
 // for generated glyphs (sin, sum, accents). Argument glyphs retain their loc.
 replace('return func.handler(context, args, optArgs);', 'var node = func.handler(context, args, optArgs); if (!node.loc && token) node.loc = (node.type === "middle" || node.type === "delimsizing") ? args[0].loc : token.loc; return node;');
 // Expanded symbols refer to the macro call, not offsets in the definition.
 replace('return this.stack.pop();', 'return this.lsLastPopped = this.stack.pop();');
 replace('this.pushTokens(tokens);\n    return tokens.length;', `
    var loc = SourceLocation.range(topToken, this.lsLastPopped);
    if (loc && loc.lexer === this.lexer) tokens = tokens.map(tok => {
      if (tok.loc && tok.loc.lexer === this.lexer && tok.loc.start >= loc.start && tok.loc.end <= loc.end) return tok;
      return Object.assign(new Token(tok.text, loc), {noexpand: tok.noexpand, treatAsRelax: tok.treatAsRelax});
    });
    this.pushTokens(tokens); return tokens.length;`);
 // Scalable delimiters are generated outside buildGroup. Preserve each side.
 replace('delim: checkDelimiter(args[0], context).text,', 'lsDelimiter: args[0].loc, delim: checkDelimiter(args[0], context).text,');
 replace('left: delim.text,\n      right: right.delim,', 'left: delim.text,\n      lsLeft: delim.loc, lsRight: right.lsDelimiter,\n      right: right.delim,');
 replace('inner.unshift(leftDelim);', 'lsLocate(leftDelim, group.lsLeft); inner.unshift(leftDelim);');
 replace('inner.push(rightDelim);', 'lsLocate(rightDelim, group.lsRight); inner.push(rightDelim);');
 replace('inner[_i] = delimiter.leftRightDelim(isMiddle.delim, innerHeight, innerDepth, isMiddle.options, group.mode, []);', 'inner[_i] = delimiter.leftRightDelim(isMiddle.delim, innerHeight, innerDepth, isMiddle.options, group.mode, []); lsLocate(inner[_i], middleDelim.lsLoc);');
 // Export only the data adapter; esbuild removes the public renderer API.
 source = source.replace(/^export \{[^\n]+\};$/m, '');
 source += `
function lsRanges(node) {
 return node.lsRanges || Array.from(node.text || '', text => ({text, loc: node.lsLoc || null}));
}
function lsLocate(node, loc) {
 if (!loc || node.lsLoc) return;
 node.lsLoc = loc;
 if (typeof node.text === 'string') node.lsRanges = lsRanges(node).map(g => g.loc ? g : {...g, loc});
 for (const child of node.children || []) lsLocate(child, loc);
}
export function sourceGlyphs(source, options = {}) {
 const tree = renderToHTMLTree(source, {...options, macros: {...options.macros}, throwOnError: true, trust: false, strict: 'ignore'});
 const result = [];
 function walk(node) {
  if (typeof node.text === 'string') for (const {text, loc} of lsRanges(node)) {
   if (/^[\\s\\u200b]$/.test(text)) continue;
   // Refuse foreign macro offsets rather than inventing a source position.
   const valid = loc && loc.lexer.input === source && loc.start >= 0 && loc.end <= source.length;
   let to = valid ? loc.end : null;
   if (valid) while (to > loc.start && /\\s/.test(source[to - 1])) to--;
   result.push({text, from: valid ? loc.start : null, to});
  }
  for (const child of node.children || []) walk(child);
 }
 walk(tree);
 return result;
}
`;
 await esbuild.build({stdin:{contents:source,loader:'js'},outfile:'build/katex-source-map.mjs',format:'esm',minify:true,target:'firefox115',treeShaking:true});
}
