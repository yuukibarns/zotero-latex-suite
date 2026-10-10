// Runs every test file and reports all failures, instead of stopping at the
// first one. New root-level test-*.mjs files are picked up automatically.
//
//   node scripts/run-tests.mjs          headless tests (CI-safe)
//   node scripts/run-tests.mjs --app    tests that launch real Zotero/Firefox
//   node scripts/run-tests.mjs foo bar  only tests whose path contains foo or bar
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";

// Modules imported by test.js, not standalone entry points.
const libraries = new Set(["test-editor.mjs", "test-compat.mjs", "test-dom.mjs", "test-zotero-caret-bootstrap.js"]);
// Launch a real Zotero or Firefox window with a disposable profile.
const appTests = [
	["node", "test-zotero-caret.mjs"],
	["node", "test-gecko-math-space.mjs"],
	["node", "tests/suite-native.mjs"],
];

const roots = readdirSync(".")
	.filter(name => /^test.*\.(js|mjs)$/.test(name) && !libraries.has(name))
	.filter(name => !appTests.some(([, file]) => file === name))
	// test.js is the main suite; run it first as before.
	.sort((a, b) => (a === "test.js" ? -1 : b === "test.js" ? 1 : a.localeCompare(b)));
const tikzcd = readdirSync("modules/tikzcd/tests")
	.filter(name => name.endsWith(".test.mjs"))
	.map(name => `modules/tikzcd/tests/${name}`);
const headless = [
	...roots.map(file => ["node", file]),
	["node", "modules/page-tools/test.cjs"],
	["node", "--test", ...tikzcd],
];

const args = process.argv.slice(2);
const filters = args.filter(arg => !arg.startsWith("--"));
const commands = (args.includes("--app") ? appTests : headless).filter(
	command => !filters.length || filters.some(filter => command.join(" ").includes(filter)),
);

function run(command) {
	return new Promise(resolve => {
		const start = performance.now();
		const child = spawn(command[0], command.slice(1), { stdio: ["ignore", "pipe", "pipe"] });
		let output = "";
		child.stdout.on("data", chunk => (output += chunk));
		child.stderr.on("data", chunk => (output += chunk));
		child.on("close", (code, signal) =>
			resolve({ code: code ?? 1, signal, output, seconds: (performance.now() - start) / 1000 }),
		);
	});
}

const failures = [];
for (const command of commands) {
	const label = command.slice(1).join(" ");
	const { code, signal, output, seconds } = await run(command);
	const skipped = code === 0 && /^Skipping\b/m.test(output);
	console.log(`${code ? "FAIL" : skipped ? "skip" : "ok  "}  ${seconds.toFixed(1).padStart(5)}s  ${label}`);
	if (code) failures.push({ label, code, signal, output });
}
for (const { label, code, signal, output } of failures) {
	console.log(`\n=== ${label} (${signal ?? `exit ${code}`}) ===\n${output.trimEnd()}`);
}
console.log(`\n${commands.length - failures.length}/${commands.length} passed`);
process.exitCode = failures.length ? 1 : 0;
