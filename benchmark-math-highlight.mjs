import {performance} from 'node:perf_hooks';
import {Schema} from 'prosemirror-model';
import {Decoration,DecorationSet} from 'prosemirror-view';
import {latexTokens} from './build/test-exports.mjs';
const sample=String.raw`\begin{aligned} \mathcal{L}_{\text{target}} &= \frac{\alpha x_i^2}{\sqrt{1+\beta}} + \sum_{i=1}^{n} p_i \log p_i \\ \end{aligned}`;
const first=performance.now();latexTokens(sample);
console.log(JSON.stringify({first_tokenization_ms:+(performance.now()-first).toFixed(2)}));
const schema=new Schema({nodes:{doc:{content:'text*'},text:{}}});
function measure(fn,n){
 for(let i=0;i<30;i++)fn();
 const times=[];
 for(let i=0;i<n;i++){const start=performance.now();fn();times.push(performance.now()-start);}
 times.sort((a,b)=>a-b);
 return {median_ms:+times[Math.floor(n*.5)].toFixed(3),p95_ms:+times[Math.floor(n*.95)].toFixed(3)};
}
for(const size of [128,1024,10240,102400]) {
 const source=sample.repeat(Math.ceil(size/sample.length)).slice(0,size);
 const doc=schema.node('doc',null,schema.text(source));
 const tokens=latexTokens(source).length;
 console.log(JSON.stringify({characters:size,tokens,plain_text_fallback:tokens===0,
  tokenizer_and_decorations:measure(()=>DecorationSet.create(doc,latexTokens(source).map(t=>Decoration.inline(t.from,t.to,{class:'ls-tex-'+t.kind}))),size>10000?100:300)}));
}
// Measures tokenization and decoration data, not browser layout/painting.
