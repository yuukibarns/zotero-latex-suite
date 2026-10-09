import { Decoration } from 'prosemirror-view';
import { latexTokens } from '../highlight/tokenizer';
import * as maps from '../conceal/maps';

type Range = { from:number; to:number; symbol:string; className?:string; revealFrom?:number; revealTo?:number; styleOnly?:boolean };
const symbols = { ...maps.cmd_symbols, ...maps.greek, ...maps.brackets };
const accents: Record<string,string> = { hat:'\u0302', dot:'\u0307', ddot:'\u0308', overline:'\u0304', bar:'\u0304', tilde:'\u0303', vec:'\u20d7' };
const styles: Record<string,string> = { mathbf:'bold', boldsymbol:'bold', mathrm:'roman', underline:'underline', operatorname:'roman', 'operatorname*':'roman', text:'roman' };
const alphabets: Record<string,Record<string,string>> = { mathbb:maps.mathbb, mathcal:maps.mathscrcal, mathscr:maps.mathscrcal, mathfrak:maps.mathfrak };

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
  const add=(to:number,symbol:string,className?:string) => {result.push({from:t.from,to,symbol,className});consumed=to;};
  if(t.kind==='operator' && (raw==='^' || raw==='_')) {
   const g=group(t.to), next=byStart.get(t.to);
   const end=g?.to ?? (next?.kind==='command' ? next.to : t.to+(source.codePointAt(t.to)!>0xffff?2:1));
   const body=g?.body ?? source.slice(t.to,end);
   const formatted=/^\\(mathrm|mathbf|boldsymbol)\{([^{}]+)\}$/.exec(body);
   const text=plain(formatted ? formatted[2] : body);
   if(text && end<=source.length && (g || !/\s/.test(body))) add(end,text,(raw==='^'?'sup':'sub')+(formatted?' ls-conceal-'+styles[formatted[1]]:''));
   continue;
  }
  if(t.kind!=='command') continue;
  if(styles[name] || alphabets[name] || accents[name]) {
   const g=group(t.to);
   if(!g) { if(source[skipSpace(t.to)]==='{') consumed=source.length; continue; }
   if(/[\n\r%$]/.test(g.body)) { consumed=g.to; continue; }
   if(name==='text' && /[^A-Za-z0-9 .!?()-]/.test(g.body)) { consumed=g.to; continue; }
   const text=plain(g.body);
   if(alphabets[name]) {
    const mapped=[...g.body].map(c=>alphabets[name][c]);
    if(mapped.length && mapped.every(c=>c!==undefined)) add(g.to,mapped.join(''));
   } else if(accents[name]) {
    if(text && [...text].length===1) add(g.to,text+accents[name]);
   } else if(text !== undefined && text.length) add(g.to,text,styles[name]);
   else if(['mathbf','boldsymbol','mathrm','underline'].includes(name) && g.body.length) {
    result.push({from:t.from,to:g.from+1,symbol:'',revealFrom:t.from,revealTo:g.to},
     {from:g.to-1,to:g.to,symbol:'',revealFrom:t.from,revealTo:g.to},
     {from:g.from+1,to:g.to-1,symbol:'',className:styles[name],styleOnly:true,revealFrom:t.from,revealTo:g.to});
   }
   continue;
  }
  if(['frac','dfrac','tfrac','gfrac'].includes(name)) {
   const a=group(t.to), b=a && group(a.to);
   if(!a || !b || /[\n\r%$]/.test(source.slice(t.to,b.to))) { if(a) consumed=a.to; continue; }
   const fraction=maps.fractions['{'+a.body+'}{'+b.body+'}'];
   if(fraction) { add(b.to,fraction);continue; }
   for(const r of [{from:t.from,to:a.from+1,symbol:'('},{from:a.to-1,to:b.from+1,symbol:')/('},{from:b.to-1,to:b.to,symbol:')'}])
    result.push({...r,revealFrom:t.from,revealTo:b.to});
   continue;
  }
  if(name==='left' || name==='right' || name==='middle') {
   const p=skipSpace(t.to), next=byStart.get(p);
   const end=next?.kind==='command'?next.to:p+1, value=source.slice(p,end);
   const symbol=maps.leftrightBrackets[value] ?? (value.startsWith('\\') ? maps.brackets[value.slice(1)] : '()[]|'.includes(value) && value ? value : undefined);
   if(symbol!==undefined) add(end,symbol);
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
 return result.sort((a,b)=>a.from-b.from || b.to-a.to);
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
  .filter(r=>r.to>r.from).map(r => Decoration.inline(r.from,r.to, {
   class:(r.styleOnly?'ls-conceal-style':'ls-tex-concealed')+(r.className?' ls-conceal-'+r.className:''),
   ...(r.styleOnly?{}:{'data-symbol':r.symbol}),
  },{inclusiveStart:false,inclusiveEnd:false}));
}
