import { Buffer } from 'src/editor/buffer';
import { latexTokens } from 'src/highlight/tokenizer';

/** Conservative CDLaTeX-style cleanup when leaving a one-character script. */
export function simplifyScriptOnExit(buffer: Buffer, target: number): boolean {
 if (!buffer.inMath || buffer.from !== buffer.to) return false;
 const source=buffer.text, cursor=buffer.to;
 // Only ^{a}, _{7}, etc.; never command arguments, whitespace, or control words.
 const start=[cursor-2,cursor-3].find(p=>p>=0 && /^[\^_]\{[A-Za-z0-9]\}$/.test(source.slice(p,p+4)) && target===buffer.positionAt(p+4));
 if(start===undefined) return false;
 const token=latexTokens(source).find(t=>t.from===start);
 if(!token || token.literal || token.kind!=='operator') return false;
 buffer.closeHistory?.();
 buffer.applyChange(start+1,start+4,source[start+2]);
 buffer.closeHistory?.();
 return true;
}
