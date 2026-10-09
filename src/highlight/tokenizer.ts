import { CONTROL_WORD, L3_COMMAND, ENCODED_CHARACTER, MACRO_PARAMETER, NUMBER, matchRule } from "./rules";

export type TokenKind = "command" | "brace" | "operator" | "comment" | "environment" | "text" | "parameter" | "escape" | "number";
export type LatexToken = { from: number; to: number; kind: TokenKind; literal?: boolean };

const TEXT_COMMANDS = new Set(["text", "textrm", "textsf", "texttt", "textnormal", "textbf", "textit", "textup", "textmd", "emph", "mbox", "hbox", "operatorname"]);
const letter = (code: number) => code >= 65 && code <= 90 || code >= 97 && code <= 122;
const space = (char: string) => char <= " " || char.charCodeAt(0) > 127 && /\s/.test(char);
type Context = { close: string; text: boolean };

/** Lightweight equation-source scanner. UTF-16 offsets match ProseMirror.
 * Escapes are consumed before comments/braces; a stack contains text mode
 * within nested text arguments. This is highlighting, not a TeX interpreter.
 */
export function latexTokens(source: string, initialText = false): LatexToken[] {
	const tokens: LatexToken[] = [];
	const contexts: Context[] = [];
	let text = initialText;
	let pending: "text" | "environment" | null = null;
	const emit = (from: number, to: number, kind: TokenKind) => {
		if (to > from) tokens.push(text ? { from, to, kind, literal: true } : { from, to, kind });
	};
	for (let i = 0; i < source.length;) {
		const start = i, char = source[i];
		const delimiter = char === "$" ? source[i + 1] === "$" ? "$$" : "$"
			: char === "\\" && "()[]".includes(source[i + 1] || " ") ? source.slice(i, i + 2) : null;
		if (delimiter && (text || contexts[contexts.length - 1]?.close === delimiter)) {
			if (contexts[contexts.length - 1]?.close === delimiter) text = contexts.pop()!.text;
			else if (text && (delimiter === "$" || delimiter === "$$" || delimiter === "\\(" || delimiter === "\\[")) {
				contexts.push({ close: delimiter === "\\(" ? "\\)" : delimiter === "\\[" ? "\\]" : delimiter, text });
				text = false;
			}
			i += delimiter.length;emit(start, i, "brace");pending = null;
		} else if (char === "\\") {
			i++;
			const word = matchRule(L3_COMMAND, source, i) || matchRule(CONTROL_WORD, source, i) || matchRule(ENCODED_CHARACTER, source, i);
			if (word) i += word.length;
			else if (i < source.length) i += source.codePointAt(i)! > 0xffff ? 2 : 1;
			const command = source.slice(start + 1, i);
			if ((command === "operatorname" || command === "verb") && source[i] === "*") i++;
			emit(start, i, "command");
			pending = TEXT_COMMANDS.has(command) ? "text" : command === "begin" || command === "end" ? "environment" : null;
			if (command === "verb" && i < source.length && !space(source[i])) {
				// Verbatim ends at its delimiter or the line boundary. Braces,
				// percent signs and backslashes in its body have no syntax meaning.
				const end = source[i];emit(i, ++i, "brace");
				const body = i;
				while (i < source.length && source[i] !== end && source[i] !== "\n" && source[i] !== "\r") i++;
				emit(body, i, "text");
				if (source[i] === end) emit(i, ++i, "brace");
			}
		} else if (char === "%") {
			while (i < source.length && source[i] !== "\n" && source[i] !== "\r") i++;
			emit(start, i, "comment");
		} else if (char === "{") {
			emit(i, ++i, "brace");
			contexts.push({ close: "}", text });
			if (pending === "text") text = true;
			else if (pending === "environment") {
				const name = i;
				while (i < source.length && (letter(source.charCodeAt(i)) || "0123456789*_-".includes(source[i]))) i++;
				emit(name, i, "environment");
			}
			pending = null;
		} else if (char === "}") {
			emit(i, ++i, "brace");
			// Recover incomplete inner math when a surrounding text group ends.
			// That prevents an unfinished $ from leaking into subsequent source.
			let context: Context | undefined;
			while ((context = contexts.pop()) && context.close !== "}") { /* unwind */ }
			text = context?.text ?? false;
			pending = null;
		} else if (space(char)) {
			i++;
		} else if (text) {
			pending = null;
			while (i < source.length && !"\\{}%$".includes(source[i]) && !space(source[i])) i++;
			emit(start, i, "text");
		} else {
			pending = null;
			const recognized = char === "^" ? matchRule(ENCODED_CHARACTER, source, i)
				: char === "#" ? matchRule(MACRO_PARAMETER, source, i)
				: char >= "0" && char <= "9" || char === "." ? matchRule(NUMBER, source, i) : null;
			if (recognized) {
				i += recognized.length;
				emit(start, i, char === "^" ? "escape" : char === "#" ? "parameter" : "number");
			} else {
				i++;
				if ("[]()".includes(char)) emit(start, i, "brace");
				else if ("_^&=+-*/<>|$~".includes(char)) emit(start, i, "operator");
			}
		}
	}
	return tokens;
}
