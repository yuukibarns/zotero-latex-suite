import { readFile, writeFile, mkdir, mkdtemp, cp, symlink, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { extract } from "../modules/tikzcd/scripts/extract.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const moduleRoot = path.join(root, "modules/tikzcd");
const manifestPath = path.join(moduleRoot, "upstream.json");
const vendor = path.join(moduleRoot, "vendor/quiver");
export const hash = data => createHash("sha256").update(data).digest("hex");
export function changedFiles(manifest, hashes) {
	return Object.entries(manifest.files)
		.filter(([name, file]) => hashes[name] !== file.sha256)
		.map(([name]) => name);
}
export async function verify(manifest, directory = vendor) {
	if (manifest.repository !== "varkor/quiver" || !/^[a-f0-9]{40}$/.test(manifest.commit))
		throw new Error("Invalid upstream identity");
	for (const [name, file] of Object.entries(manifest.files)) {
		if (
			!/^[\w.-]+$/.test(name) ||
			!/^[a-f0-9]{64}$/.test(file.sha256) ||
			!/^(LICENSE|src\/[\w./-]+)$/.test(file.path) ||
			file.path.includes("..")
		)
			throw new Error("Invalid upstream file entry");
		if (hash(await readFile(path.join(directory, name))) !== file.sha256)
			throw new Error(`Upstream snapshot modified: ${name}`);
	}
}
async function request(url, json = false) {
	const headers = { "User-Agent": "latex-suite-upstream-check" };
	if (process.env.GITHUB_TOKEN && new URL(url).hostname === "api.github.com")
		headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
	const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
	if (!response.ok) throw new Error(`${response.status} fetching ${url}`);
	if (json) return response.json();
	const data = Buffer.from(await response.arrayBuffer());
	if (data.length > 2_000_000) throw new Error("Unexpectedly large upstream file");
	return data;
}
async function snapshots(manifest, commit) {
	return Object.fromEntries(
		await Promise.all(
			Object.entries(manifest.files).map(async ([name, file]) => [
				name,
				await request(`https://raw.githubusercontent.com/${manifest.repository}/${commit}/${file.path}`),
			]),
		),
	);
}
async function main() {
	const [command = "verify", ref, flag] = process.argv.slice(2);
	if (
		!["verify", "check", "update"].includes(command) ||
		(command !== "update" && ref) ||
		(command === "update" && (!/^[a-f0-9]{40}$/.test(ref || "") || (flag && flag !== "--dry-run")))
	) {
		throw new Error("Usage: quiver-upstream.mjs verify | check | update <full-commit-sha> [--dry-run]");
	}
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	await verify(manifest);
	if (command === "verify") {
		console.log("Quiver snapshots match pinned SHA-256 hashes.");
		return;
	}
	const commit = await request(
		`https://api.github.com/repos/${manifest.repository}/commits/${encodeURIComponent(ref || manifest.ref)}`,
		true,
	);
	const files = await snapshots(manifest, commit.sha);
	const changed = changedFiles(
		manifest,
		Object.fromEntries(Object.entries(files).map(([name, data]) => [name, hash(data)])),
	);
	console.log(
		JSON.stringify(
			{
				pinned: manifest.commit,
				upstream: commit.sha,
				changedFiles: changed,
				compare: `https://github.com/${manifest.repository}/compare/${manifest.commit}...${commit.sha}`,
			},
			null,
			2,
		),
	);
	if (command === "check") return; // Never modify snapshots or merge upstream automatically.
	if (execFileSync("git", ["status", "--porcelain", "--", "modules/tikzcd"], { cwd: root, encoding: "utf8" }).trim()) {
		throw new Error("Commit or stash local TikZ-CD changes before updating snapshots.");
	}
	const stage = await mkdtemp(path.join(tmpdir(), "latex-suite-quiver-"));
	try {
		await mkdir(path.join(stage, "vendor/quiver"), { recursive: true });
		for (const [name, data] of Object.entries(files)) await writeFile(path.join(stage, "vendor/quiver", name), data);
		for (const name of ["src", "tests"])
			await cp(path.join(moduleRoot, name), path.join(stage, name), { recursive: true });
		await symlink(path.join(root, "node_modules"), path.join(stage, "node_modules"), "dir");
		await extract(pathToFileURL(path.join(stage, "vendor/quiver/")), pathToFileURL(path.join(stage, "build/quiver/")));
		for (const name of ["renderer", "note-integration"])
			await build({
				entryPoints: [path.join(stage, `src/${name}.mjs`)],
				outfile: path.join(stage, `build/${name}.mjs`),
				bundle: true,
				format: "esm",
				target: "firefox128",
				loader: { ".css": "text" },
				alias: { katex: "katex-zotero" },
				absWorkingDir: root,
			});
		execFileSync(
			process.execPath,
			["--test", path.join(stage, "tests/note.test.mjs"), path.join(stage, "tests/renderer.test.mjs")],
			{ cwd: root, stdio: "inherit" },
		);
		if (flag === "--dry-run") {
			console.log("Candidate extraction and tests passed; no files changed.");
			return;
		}
		const next = {
			...manifest,
			commit: commit.sha,
			files: Object.fromEntries(
				Object.entries(manifest.files).map(([name, file]) => [name, { ...file, sha256: hash(files[name]) }]),
			),
		};
		// Retain originals for rollback if any local write fails. Never commit/push here.
		const originals = new Map(
			await Promise.all(
				Object.keys(files).map(async name => [path.join(vendor, name), await readFile(path.join(vendor, name))]),
			),
		);
		originals.set(manifestPath, await readFile(manifestPath));
		try {
			for (const [name, data] of Object.entries(files)) await writeFile(path.join(vendor, name), data);
			await writeFile(manifestPath, JSON.stringify(next, null, 2) + "\n");
		} catch (error) {
			for (const [filename, data] of originals) await writeFile(filename, data);
			throw error;
		}
		console.log(
			"Candidate applied locally. Review git diff, run the full suite and native visual/PDF checks before committing.",
		);
	} finally {
		await rm(stage, { recursive: true, force: true });
	}
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
	main().catch(error => {
		console.error(error.message);
		process.exitCode = 1;
	});
