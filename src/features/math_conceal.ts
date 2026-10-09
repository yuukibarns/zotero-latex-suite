import { Decoration } from 'prosemirror-view';
import { latexTokens } from '../highlight/tokenizer';

// Standard TeX/Unicode correspondences, not replacements in the stored document.
// Interaction follows Obsidian LaTeX Suite's reveal-on-selection approach.
const symbols: Record<string, string> = {
 alpha:'α', beta:'β', gamma:'γ', delta:'δ', epsilon:'ϵ', varepsilon:'ε',
 zeta:'ζ', eta:'η', theta:'θ', vartheta:'ϑ', iota:'ι', kappa:'κ', lambda:'λ',
 mu:'μ', nu:'ν', xi:'ξ', pi:'π', varpi:'ϖ', rho:'ρ', varrho:'ϱ', sigma:'σ',
 varsigma:'ς', tau:'τ', upsilon:'υ', phi:'ϕ', varphi:'φ', chi:'χ', psi:'ψ', omega:'ω',
 Gamma:'Γ', Delta:'Δ', Theta:'Θ', Lambda:'Λ', Xi:'Ξ', Pi:'Π', Sigma:'Σ',
 Upsilon:'Υ', Phi:'Φ', Psi:'Ψ', Omega:'Ω',
 gets:'←', leftarrow:'←', to:'→', rightarrow:'→', leftrightarrow:'↔', mapsto:'↦',
 Leftarrow:'⇐', Rightarrow:'⇒', Leftrightarrow:'⇔',
 in:'∈', notin:'∉', ni:'∋', subset:'⊂', supset:'⊃', subseteq:'⊆', supseteq:'⊇',
 le:'≤', leq:'≤', ge:'≥', geq:'≥', ne:'≠', neq:'≠', approx:'≈', equiv:'≡',
 times:'×', cdot:'⋅', pm:'±', mp:'∓', otimes:'⊗', oplus:'⊕',
 infty:'∞', partial:'∂', nabla:'∇', forall:'∀', exists:'∃', neg:'¬',
 cap:'∩', cup:'∪', land:'∧', lor:'∨', emptyset:'∅',
};

export function concealRanges(source: string) {
 // Diagram grammars have their own interpretation of text and commands.
 if (/\\begin\{tikzcd\}/.test(source)) return [];
 const prose = /^\s*\\begin\{(?:algorithm|algorithmic)\}/.test(source);
 return latexTokens(source, prose).flatMap(t => {
  const symbol = t.kind === 'command' && !t.literal ? symbols[source.slice(t.from + 1, t.to)] : undefined;
  return symbol ? [{ from:t.from, to:t.to, symbol }] : [];
 });
}

export function concealDecorations(ranges: ReturnType<typeof concealRanges>, from: number, to: number) {
 return ranges.filter(r => to < r.from || from > r.to).map(r => Decoration.inline(r.from, r.to, {
  class:'ls-tex-concealed', 'data-symbol':r.symbol,
 }, { inclusiveStart:false, inclusiveEnd:false }));
}
