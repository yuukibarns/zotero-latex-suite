// Read-only benchmark. Prints aggregates only, never annotation contents.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
const source = readFileSync("bootstrap.js", "utf8");
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf("const annotationCache ="), source.indexOf("function inject(")), context);
const sql = vm.runInContext("annotationSQL", context).replace("?", "1");
const runs = [];
let rows;
for (let i = 0; i < 5; i++) {
	const start = performance.now();
	rows = JSON.parse(
		execFileSync("sqlite3", ["-readonly", "-json", process.argv[2], sql], {
			encoding: "utf8",
			maxBuffer: 128 * 1024 * 1024,
		}) || "[]",
	);
	runs.push(performance.now() - start);
}
const start = performance.now();
const entries = rows.map(r => [r.comment, r.text, r.type, r.page, r.source].join("\n").toLowerCase());
const normalizationMs = performance.now() - start;
const times = [];
for (let i = 0; i < 100; i++) {
	const t = performance.now();
	entries.filter(s => s.includes("th"));
	times.push(performance.now() - t);
}
times.sort((a, b) => a - b);
console.log(
	JSON.stringify(
		{
			rows: rows.length,
			textCommentCharacters: rows.reduce((n, r) => n + (r.text || "").length + (r.comment || "").length, 0),
			bulkReadAndJSONParseMs: runs,
			normalizationMs,
			substringScanP95Ms: times[94],
		},
		null,
		2,
	),
);
