/* Independent module lifecycles. Active standalone add-ons retain ownership. */
var SuiteModules = {
	async install(env, rootURI, settings) {
		const { Zotero, Services, AddonManager } = env;
		const definitions = [
			["pseudocodeEnabled", null, "pseudocode"],
			["tikzcdEnabled", "tikzcd-preview@yuukibarns", "tikzcd"],
			["pdfPageToolsEnabled", "pdf-page-tools@yuukibarns", "page-tools"],
			["annotationBacklinksEnabled", "annotation-backlinks@local", "backlinks"],
			["compactMenuEnabled", "compact-menu@yuukibarns", "compact-menu"],
		];
		const running = new Map(),
			blocked = new Set();
		let stopped = false,
			queue = Promise.resolve();
		const report = error => Zotero.logError(error);
		function stop(key) {
			const scope = running.get(key);
			if (!scope) return;
			running.delete(key);
			try {
				scope.shutdown();
			} catch (error) {
				report(error);
			}
		}
		async function reconcile() {
			for (const [key, id, path] of definitions) {
				const addon = id ? await AddonManager.getAddonByID(id) : null;
				const enabled = !stopped && settings()[key] !== false && !blocked.has(id) && !addon?.isActive;
				if (!enabled) {
					stop(key);
					continue;
				}
				if (running.has(key)) continue;
				const scope = { ...env, noteControllerKey: path === "pseudocode" ? "__pseudocodeNotes" : "__tikzcdNotes" };
				const uri = rootURI + "modules/" + path + "/";
				try {
					Services.scriptloader.loadSubScript(
						(path === "pseudocode" ? rootURI + "modules/tikzcd/" : uri) + "bootstrap.js",
						scope,
					);
					running.set(key, scope);
					await scope.startup({ id: "latex-suite@ievlevpn.github.io", rootURI: uri });
					// An add-on enable or suite shutdown can stop the scope while its
					// startup is awaiting Zotero. Clean any resources acquired afterward.
					if (running.get(key) !== scope) scope.shutdown();
					else if (stopped || settings()[key] === false || blocked.has(id)) stop(key);
				} catch (error) {
					stop(key);
					report(error);
				}
			}
		}
		function refresh() {
			queue = queue.then(reconcile).catch(report);
			return queue;
		}
		const listener = {
			onEnabling(addon) {
				const definition = definitions.find(d => d[1] === addon.id);
				if (definition) {
					blocked.add(addon.id);
					stop(definition[0]);
				}
			},
			onEnabled(addon) {
				blocked.delete(addon.id);
				refresh();
			},
			onDisabled(addon) {
				blocked.delete(addon.id);
				refresh();
			},
			onUninstalled(addon) {
				blocked.delete(addon.id);
				refresh();
			},
			onOperationCancelled(addon) {
				blocked.delete(addon.id);
				refresh();
			},
		};
		AddonManager.addAddonListener(listener);
		await refresh();
		return {
			refresh,
			windowOpened(window) {
				for (const scope of running.values()) scope.onMainWindowLoad?.({ window });
			},
			windowClosed(window) {
				for (const scope of running.values()) scope.onMainWindowUnload?.({ window });
			},
			dispose() {
				stopped = true;
				AddonManager.removeAddonListener(listener);
				for (const key of [...running.keys()]) stop(key);
			},
		};
	},
};
