import { Decoration } from 'prosemirror-view';
import { latexTokens } from '../highlight/tokenizer';
import * as maps from '../conceal/maps';
import symbolFonts from '../conceal/fonts.json';
import { scriptItalicCorrection } from '../../build/katex-source-map.mjs';

type Range = { from:number; to:number; symbol:string; font?:string; className?:string; revealFrom?:number; revealTo?:number; styleOnly?:boolean; scale?:number; offset?:number };
// KaTeX's implication macros use the long arrows, unlike Rightarrow/Leftarrow.
const symbols = { ...maps.cmd_symbols, ...maps.greek, ...maps.brackets, implies:'⟹', impliedby:'⟸', iff:'⟺' };
const formatting: Record<string,string> = { mathbf:'bold', bm:'bold', boldsymbol:'bold', mathit:'italic', mathrm:'roman', underline:'underline' };
const styles: Record<string,string> = { ...formatting, operatorname:'roman', 'operatorname*':'roman', text:'text' };
const alphabets: Record<string,Record<string,string>> = { mathfrak:maps.mathfrak };
const alphabetFonts: Record<string,string> = { mathbb:'AMS-Regular', mathcal:'Caligraphic-Regular', mathscr:'Script-Regular' };
/** Upstream-backed rules, with UTF-16 offsets and conservative argument parsing.
 * Compound replacements reveal together, including their nested replacements. */
export function concealRanges(source: string): Range[] {
 if (source.length > 50000 || /\\begin\{tikzcd\}/.test(source)) return [];
 const tokens = latexTokens(source, /^\s*\\begin\{(?:algorithm|algorithmic)\}/.test(source));
 const byStart = new Map(tokens.map(t => [t.from,t]));
 const closes = new Map<number,number>(), stack:number[] = [];
 for (const t of tokens) if(t.kind === 'brace') {
  const s=source.slice(t.from,t.to);
  if(s === '{') stack.push(t.from);
  if(s === '}' && stack.length) closes.set(stack.pop()!,t.to);
 }
 const skipSpace = (p:number) => { while(source[p] === ' ' || source[p] === '\t') p++; return p; };
 const group = (p:number) => { p=skipSpace(p); const end=closes.get(p); return end ? {from:p,to:end,body:source.slice(p+1,end-1)} : undefined; };
 function plain(body:string):string | undefined {
  if(/[{}%$\n\r_^]/.test(body)) return;
  let ok=true;
  const text=body.replace(/\\([A-Za-z]+|.)/g,(_,name:string)=> {
   const value=symbols[name] || (maps.operators[name] ? name : undefined);
   if(value === undefined) { ok=false; return ''; } return value;
  });
  return ok ? text : undefined;
 }
 const result:Range[]=[];
 let consumed=0;
 for(const t of tokens) {
  if(t.from < consumed || t.literal) continue;
  const raw=source.slice(t.from,t.to), name=raw.slice(1);
  const add=(to:number,symbol:string,className?:string,font?:string) => {result.push({from:t.from,to,symbol,className,font});consumed=to;};
  if(t.kind==='operator' && (raw==='^' || raw==='_')) {
   const start=skipSpace(t.to), g=group(start), next=byStart.get(start);
   const command=next?.kind==='command';
   const end=g?.to ?? (command ? next.to : start+(source.codePointAt(start)!>0xffff?2:1));
   if(!g && (start>=source.length || /[{}_^%\\\s]/.test(source[start]) && !command)) continue;
   if(command && !symbols[source.slice(start+1,end)] && !maps.operators[source.slice(start+1,end)]) continue;
   const from=g ? g.from+1 : start, to=g ? g.to-1 : end;
   if(from===to) continue;
   result.push({from:t.from,to:from,symbol:'',revealFrom:t.from,revealTo:end},
    {from,to,symbol:'',className:raw==='^'?'sup':'sub',styleOnly:true,revealFrom:t.from,revealTo:end});
   if(g) result.push({from:to,to:end,symbol:'',revealFrom:t.from,revealTo:end});
   continue;
  }
  if(t.kind!=='command') continue;

  if(styles[name] || alphabets[name] || alphabetFonts[name]) {
   const g=group(t.to);
   if(!g) { if(source[skipSpace(t.to)]==='{') consumed=source.length; continue; }
   if(/[\n\r%$]/.test(g.body)) { consumed=g.to; continue; }
   if(name==='text' && /[^A-Za-z0-9 .!?()-]/.test(g.body)) { consumed=g.to; continue; }
   const text=plain(g.body);
   if(formatting[name] && g.body.length) {
    // Hide only the wrapper: nested symbol/font conceal remains independent.
    result.push({from:t.from,to:g.from+1,symbol:'',revealFrom:t.from,revealTo:g.to},
     {from:g.to-1,to:g.to,symbol:'',revealFrom:t.from,revealTo:g.to},
     {from:g.from+1,to:g.to-1,symbol:'',className:styles[name],styleOnly:true,revealFrom:t.from,revealTo:g.to});
   } else if(alphabetFonts[name]) {
    // These KaTeX alphabets encode uppercase Latin glyphs at ASCII positions.
    // Preserve unsupported arguments instead of guessing a Unicode substitute.
    if(/^[A-Z]+$/.test(g.body)) add(g.to,g.body,undefined,alphabetFonts[name]);
   } else if(alphabets[name]) {
    const mapped=[...g.body].map(c=>alphabets[name][c]);
    if(mapped.length && mapped.every(c=>c!==undefined)) add(g.to,mapped.join(''));
   } else if(text !== undefined && text.length) add(g.to,text,styles[name]);
   continue;
  }
  if(name==='left' || name==='right' || name==='middle') {
   const p=skipSpace(t.to), next=byStart.get(p);
   const end=next && (next.kind==='command' || next.kind==='escape')?next.to:p+1, value=source.slice(p,end);
   const symbol=maps.leftrightBrackets[value] ?? (value==='\\{' || value==='\\}' ? value.slice(1) : value.startsWith('\\') ? maps.brackets[value.slice(1)] : '()[]|'.includes(value) && value ? value : undefined);
   if(symbol!==undefined) add(end,symbol,'boundary',(symbolFonts as Record<string,string>)[symbol]);
   continue;
  }
  if(name==='not') {
   const next=byStart.get(skipSpace(t.to));
   const value=next?.kind==='command' && maps.not_remap[source.slice(next.from+1,next.to)];
   if(value && next) add(next.to,value);
   continue;
  }
  // Do not hide spacing/style controls or argument-taking commands as symbols.
  if(symbols[name] && !['sqrt','choose'].includes(name)) add(t.to,symbols[name]);
  else if(maps.operators[name]) add(t.to,name,'roman');
 }
 // Carry script presentation onto symbol replacements too: inline highlight
 // boundaries can split a formatting span into siblings rather than children.
 const scripts=new Set(result.filter(r=>r.styleOnly && (r.className==='sup' || r.className==='sub')));
 // Flatten nested layers into disjoint spans. ProseMirror splits decorations
 // at token boundaries, so CSS nesting cannot reliably supply script depth.
 const events=[...scripts].flatMap(r=>[{pos:r.from,open:true,r},{pos:r.to,open:false,r}])
  .sort((a,b)=>a.pos-b.pos || Number(a.open)-Number(b.open));
 const active:Range[]=[], layers:Range[]=[];
 let previous=0;
 for(const event of events) {
  const parent=active[active.length-1];
  if(parent && event.pos>previous) layers.push({...parent,from:previous,to:event.pos,
   revealFrom:active[0].revealFrom,revealTo:active[0].revealTo});
  if(event.open) active.push({...event.r,scale:Math.max(0.6,(parent?.scale??1)*0.8),
   offset:(parent?.offset??0)+(event.r.className==='sup'?0.4:-0.2)*(parent?.scale??1)});
  else active.pop();
  previous=event.pos;
 }
 const flattened=[...result.filter(r=>!scripts.has(r)),...layers].sort((a,b)=>a.from-b.from || b.to-a.to);
 let script=0;
 for(const r of flattened) {
  while(script<layers.length && layers[script].to<=r.from) script++;
  const layer=layers[script];
  if(layer && r!==layer && r.from>=layer.from && r.to<=layer.to && r.symbol) {
   if(!r.className && !r.font) r.font=(symbolFonts as Record<string,string>)[r.symbol];
   r.className=(r.className ? r.className+' ls-conceal-' : '')+layer.className;
   r.scale=layer.scale;r.offset=layer.offset;
  }
 }
 return flattened;
}

export function concealDecorations(ranges: Range[], from: number, to: number) {
 const touched=ranges.filter(r=>to >= (r.revealFrom??r.from) && from <= (r.revealTo??r.to))
  .map(r=>({from:r.revealFrom??r.from,to:r.revealTo??r.to})).sort((a,b)=>a.from-b.from);
 const merged: {from:number;to:number}[]=[];
 for(const r of touched) {
  const last=merged[merged.length-1];
  if(last && r.from<=last.to) last.to=Math.max(last.to,r.to); else merged.push({...r});
 }
 let index=0;
 return ranges.filter(r => {
  while(index<merged.length && merged[index].to<=r.from) index++;
  return index===merged.length || merged[index].from>=r.to;
 })
  .filter(r=>r.to>r.from).flatMap(r => {
   const style=r.className?' ls-conceal-'+r.className:'';
   const font=r.font ?? (!r.className ? (symbolFonts as Record<string,string>)[r.symbol] : undefined);
   // Like KaTeX's combined SymbolNode, reserve the final script letter's
   // overhang. The pseudo-element's em uses the actual enlarged glyph size.
   const italic=font==='Script-Regular' ? scriptItalicCorrection(r.symbol.slice(-1)) : 0;
   const scriptStyle=r.scale===undefined?'':`--ls-script-scale:${r.scale};--ls-script-offset:${r.offset};`;
   const options={inclusiveStart:false,inclusiveEnd:false,concealKey:JSON.stringify([r.styleOnly,r.className,r.symbol,font,r.scale,r.offset])};
   const hidden=Decoration.inline(r.from,r.to,{class:(r.styleOnly?'ls-conceal-style':'ls-tex-concealed')+style,...(scriptStyle?{style:scriptStyle}:{})},options);
   // ProseMirror splits inline decorations at every overlapping highlight.
   // Attach replacement content only to the first source code unit (ASCII
   // command/script/brace prefix), never to the splittable hidden range.
   return r.styleOnly || !r.symbol ? [hidden] : [hidden,
    Decoration.inline(r.from,r.from+1,{class:'ls-conceal-symbol'+style+(font?' ls-conceal-font-'+font:''),'data-symbol':r.symbol,...(italic || scriptStyle ? {style:scriptStyle+(italic?'--ls-conceal-italic-correction:'+italic+'em':'')} : {})},options)];
  });
}
