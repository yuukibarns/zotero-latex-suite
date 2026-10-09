import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderPseudocode, isPseudocode, rendererCSS } from './modules/pseudocode/build/renderer.mjs';
const doc = new JSDOM('<div id="host"></div>').window.document;
const host = doc.getElementById('host');
const source = String.raw`\begin{algorithm}
\caption{Sum}
\begin{algorithmic}
\STATE $s \gets 0$
\FOR{$i=1$ to $n$}
\STATE $s \gets s+i$
\ENDFOR
\RETURN $s$
\end{algorithmic}
\end{algorithm}`;
assert(isPseudocode(source)); assert(!isPseudocode('x+y'));
const a = await renderPseudocode(host, source);
assert(a.element.querySelector('.ps-algorithm'));
assert(a.element.querySelector('.katex'));
const b = await renderPseudocode(host, source);
assert.equal(a.element.innerHTML,b.element.innerHTML,'Deterministic captions');
a.dispose(); b.dispose(); assert.equal(host.children.length,0);
const safe = await renderPseudocode(host,String.raw`\begin{algorithmic}\STATE <img src=x onerror=alert(1)> $\href{javascript:alert(1)}{x}$\end{algorithmic}`);
assert(!safe.element.querySelector('img,a,script,iframe'));
safe.dispose();
assert(!rendererCSS.includes('@import'));
for (const body of [
 String.raw`\IF{$x$}\IF{$y$}\RETURN $y$\ENDIF\ELIF{$z$}\STATE $z$\ELSE\STATE $x$\ENDIF`,
 String.raw`\UPON{$x$}\STATE $x$\ENDUPON`,
 String.raw`\WHILE{$x$}\BREAK\ENDWHILE\FORALL{$x$}\CONTINUE\ENDFOR`,
 String.raw`\REPEAT\STATE $x$\UNTIL{$x$}`,
 String.raw`\FUNCTION{F}{$x$}\RETURN $x$\ENDFUNCTION\PROCEDURE{P}{$x$}\PRINT $x$\ENDPROCEDURE`,
 String.raw`\STATE $x$\COMMENT{A comment}`,
]) {
 const result=await renderPseudocode(host,'\\begin{algorithmic}'+body+'\\end{algorithmic}');
 assert(result.element.querySelector('.ps-code'));
 result.dispose();
}
await assert.rejects(renderPseudocode(host,'x'.repeat(20001)),/too large/);
await assert.rejects(renderPseudocode(host,String.raw`\begin{algorithmic}\IF{x}`));
const controller = new AbortController();controller.abort();
await assert.rejects(renderPseudocode(host,source,{signal:controller.signal}),{name:'AbortError'});
console.log('Pseudocode: render, math, escaping, captions, limits and abort passed.');
