import assert from "node:assert/strict";
import { Schema } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { annotationToken, annotationMatches } from "./build/test-exports.mjs";
const schema = new Schema({
	nodes: {
		doc: { content: "block+" },
		text: { group: "inline" },
		paragraph: { group: "block", content: "inline*" },
		code_block: { group: "block", content: "text*", code: true },
		math_display: { group: "block", content: "text*" },
	},
});
function view(text, type = "paragraph") {
	const doc = schema.node("doc", null, [schema.node(type, null, text ? schema.text(text) : null)]);
	return { state: EditorState.create({ doc, selection: TextSelection.create(doc, 1 + text.length) }) };
}
assert.equal(annotationToken(view("hello @@query")).query, "query");
assert.equal(annotationToken(view("@@")).query, "");
assert.equal(annotationToken(view("email@@query")), null);
assert.equal(annotationToken(view("@@query", "code_block")), null);
assert.equal(annotationToken(view("@@query", "math_display")), null);
const items = [
	{ text: "target", comment: "", type: "highlight", page: "1" },
	{ text: "", comment: "target comment", type: "note", page: "2" },
	{ text: "", comment: "", type: "image", page: "3" },
];
assert.equal(annotationMatches(items, "target")[0], items[0]);
assert.equal(annotationMatches(items, "").length, 3);
assert.equal(annotationMatches(items, "3").length, 0);
console.log("Annotation query contexts and text/comment matching passed.");
