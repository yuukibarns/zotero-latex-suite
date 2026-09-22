import defaults from "./commands.json";
import { Buffer } from "../editor/buffer";
import { ResultInsert } from "../snippets/luasnip_api/node";
import { Context } from "../utils/context";

export type Command = { displayName: string; replacement: string };
export const DEFAULT_COMMANDS: Command[] = defaults;
export function parseCommands(value: unknown): Command[] {
	if (!Array.isArray(value)) throw new Error("Completion dictionary must be a JSON array");
	return value.map(entry => {
		const item = typeof entry === "string" ? { displayName: entry, replacement: entry } : entry;
		if (!item || typeof item.displayName !== "string" || !item.displayName || /[\r\n]/.test(item.displayName) || typeof item.replacement !== "string")
			throw new Error("Expected a command string or {displayName, replacement}");
		return { displayName: item.displayName, replacement: item.replacement };
	});
}
export function tokenAt(buffer: Buffer, minimum: number) {
	if (!buffer.inMath || buffer.dollarMath || buffer.from !== buffer.to || /[a-z]/i.test(buffer.text.charAt(buffer.to))) return null;
	const match = /\\?[a-z]+$/i.exec(buffer.text.slice(0, buffer.from));
	if (!match) return null;
	const query = match[0].replace(/^\\/, "");
	if (query.length < minimum) return null;
	// Share the snippet engine's brace-aware text/metadata argument detection.
	// tokenAt is also called on acceptance, so a stale popup cannot bypass this.
	const { mode } = Context.fromBuffer(buffer);
	if (mode.textEnv || mode.snippetlessEnv) return null;
	return { from: match.index, to: buffer.to, query, text: match[0] };
}
export function candidates(commands: Command[], query: string): Command[] {
	const lower = query.toLowerCase();
	if (!lower) return [];
	return commands.map((command, index) => {
		const name = command.displayName.replace(/^\\/, "");
		const folded = name.toLowerCase();
		const rank = name.startsWith(query) ? 0 : folded.startsWith(lower) ? 1 : folded.includes(lower) ? 2 : 3;
		// Ordered subsequence matching. Prefer compact matches, then earlier starts.
		// Try every first-character position so a later contiguous match can win.
		let score = Infinity;
		for (let start = folded.indexOf(lower[0]); start >= 0; start = folded.indexOf(lower[0], start + 1)) {
			let end = start;
			for (let i = 1; i < lower.length && end >= 0; i++) end = folded.indexOf(lower[i], end + 1);
			if (end >= 0) score = Math.min(score, (end - start + 1 - lower.length) * 10 + start);
		}
		return { command, index, name, rank, score };
	}).filter(x => Number.isFinite(x.score))
		.sort((a, b) => a.rank - b.rank || a.score - b.score || a.name.split("{")[0].length - b.name.split("{")[0].length || a.index - b.index)
		.map(x => x.command);
}
export function replacementOf(source: string, inline = false): ResultInsert {
	let insert = "";
	const tabstops: { index: number[]; from: number; to: number }[] = [];
	let final: number | undefined;
	for (let i = 0; i < source.length; i++) {
		const c = source[i];
		if (c === "\\" && source[i + 1] === "#") { insert += "\\#"; i++; }
		else if (c === "#") tabstops.push({ index: [tabstops.length + 1], from: insert.length, to: insert.length });
		else if (c === "~") final = insert.length;
		else if (!(inline && c === "\n")) insert += c;
	}
	if (tabstops.length || final !== undefined) tabstops.push({ index: [tabstops.length + 1], from: final ?? insert.length, to: final ?? insert.length });
	return { insert, tabstops };
}
