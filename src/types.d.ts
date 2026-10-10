declare module "*?raw" {
	const source: string;
	export default source;
}

/** manifest.json version, injected by esbuild.config.mjs. */
declare const __LATEX_SUITE_VERSION__: string;
