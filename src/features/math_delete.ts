import { Buffer } from "../editor/buffer";

/** Delete a selection or the preceding word without ever deleting a math node. */
export function deleteMathWord(buffer: Buffer): boolean {
	if (!buffer.inMath || buffer.dollarMath) return false;
	let start = buffer.from;
	if (start === buffer.to) {
		const prefix = buffer.text.slice(0, start);
		// TeX control words are atomic; punctuation/braces are single characters.
		// Trailing whitespace is consumed along with the preceding token.
		const match = /(?:\\[a-zA-Z]+|[\p{L}\p{N}]+|[^\s])\s*$|\s+$/u.exec(prefix);
		if (!match) return true; // Swallow the native node-delete at offset zero.
		start = match.index;
	}
	buffer.closeHistory?.();
	buffer.replaceRange(start, buffer.to, "");
	buffer.closeHistory?.();
	return true;
}
