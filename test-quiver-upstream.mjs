import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { uiPrelude } from "./modules/tikzcd/scripts/extract.mjs";
import { hash, verify, changedFiles } from "./scripts/quiver-upstream.mjs";
const ui = await readFile("modules/tikzcd/vendor/quiver/ui.mjs", "utf8");
const original = uiPrelude(ui);
const moved = uiPrelude("const unrelated = 123;\n" + ui);
assert.equal(moved.imports, original.imports);
assert.equal(moved.constants, original.constants);
assert.throws(() => uiPrelude(ui + "\nObject.assign(CONSTANTS, {});"), /constants changed/);
assert.throws(() => uiPrelude(ui.replace('"./arrow.mjs"', '"./renamed.mjs"')), /import changed/);
assert.throws(() => uiPrelude(ui.replace("Object.assign(CONSTANTS,", "Object.assign(RENAMED,")), /constants changed/);
const manifest = JSON.parse(await readFile("modules/tikzcd/upstream.json", "utf8"));
await verify(manifest);
assert.deepEqual(
	changedFiles(manifest, Object.fromEntries(Object.entries(manifest.files).map(([n, f]) => [n, f.sha256]))),
	[],
);
assert.deepEqual(changedFiles({ files: { a: { sha256: "same" }, b: { sha256: "old" } } }, { a: "same", b: "new" }), [
	"b",
]);
const stage = await mkdtemp(path.join(tmpdir(), "quiver-hash-test-"));
try {
	const test = {
		repository: "varkor/quiver",
		commit: "a".repeat(40),
		files: { "sample.mjs": { path: "src/sample.mjs", sha256: hash("original") } },
	};
	await writeFile(path.join(stage, "sample.mjs"), "original");
	await verify(test, stage);
	await writeFile(path.join(stage, "sample.mjs"), "modified");
	await assert.rejects(verify(test, stage), /snapshot modified/);
	await assert.rejects(
		verify({ ...test, files: { "../escape": test.files["sample.mjs"] } }, stage),
		/Invalid upstream file/,
	);
} finally {
	await rm(stage, { recursive: true, force: true });
}
console.log("Upstream hashes, change detection and position-independent AST extraction passed.");
