/** Adapted recognition rules, not bundled highlighter runtimes.
 * Highlight.js latex.js: fc3f06392f189354eed922973635ab9e9268b983
 * Author: Benedikt Wilde. BSD-3-Clause: HIGHLIGHTJS-LICENSE.
 * CodeMirror stex.js: ca1becfc97b36d461f77cf631b95b80185fdfb3a
 * MIT: CODEMIRROR-LICENSE. Provenance details in notes/highlight-rules.md.
 * Sticky matching replaces each upstream rule's implicit current-position match.
 */
export const CONTROL_WORD = /[a-zA-Z@]+/y;
export const L3_COMMAND = new RegExp(
	[
		"(?:__)?[a-zA-Z]{2,}_[a-zA-Z](?:_?[a-zA-Z])+:[a-zA-Z]*",
		"[lgc]__?[a-zA-Z](?:_?[a-zA-Z])*_[a-zA-Z]{2,}",
		"[qs]__?[a-zA-Z](?:_?[a-zA-Z])+",
		"use(?:_i)?:[a-zA-Z]*",
		"(?:else|fi|or):",
		"(?:if|cs|exp):w",
		"(?:hbox|vbox):n",
		"::[a-zA-Z]_unbraced",
		"::[a-zA-Z:]",
	]
		.map(pattern => pattern + "(?![a-zA-Z:_])")
		.join("|"),
	"y",
);
export const ENCODED_CHARACTER =
	/\^{6}[0-9a-f]{6}|\^{5}[0-9a-f]{5}|\^{4}[0-9a-f]{4}|\^{3}[0-9a-f]{3}|\^{2}[0-9a-f]{2}|\^{2}[\u0000-\u007f]/y;
export const MACRO_PARAMETER = /#+\d?/y;
export const NUMBER = /\d+\.\d*|\d*\.\d+|\d+/y;

export function matchRule(rule: RegExp, source: string, offset: number): string | null {
	rule.lastIndex = offset;
	return rule.exec(source)?.[0] ?? null;
}
