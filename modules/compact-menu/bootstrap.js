var windows = new Map();
var stopped = false;
var generation = 0;
var observing = false;
const PREF = "extensions.compact-menu.showMenuBar";

function attach(win) {
	if (stopped || windows.has(win) || Zotero.isMac) return;
	const doc = win.document;
	const titlebar = doc.getElementById("titlebar");
	const menubar = doc.getElementById("main-menubar");
	const toolbar = doc.getElementById("zotero-tabs-toolbar");
	const tabRow = doc.getElementById("zotero-title-bar");
	const controls = titlebar?.querySelector(".titlebar-buttonbox");
	if (!titlebar || !menubar || !toolbar || !controls || !tabRow) return;
	const placements = new Map();
	function move(node, parent, before = null) {
		if (!placements.has(node)) {
			const anchor = doc.createComment("compact-menu restore point");
			node.before(anchor);
			placements.set(node, anchor);
		}
		parent.insertBefore(node, before);
	}
	function restore(node) {
		const anchor = placements.get(node);
		if (anchor?.parentNode) anchor.after(node);
	}
	const button = doc.createXULElement("toolbarbutton");
	button.id = "compact-menu-button";
	button.setAttribute("type", "menu");
	button.setAttribute("class", "zotero-tb-button");
	button.setAttribute("tooltiptext", "Application menu");
	button.setAttribute("aria-label", "Application menu");
	button.setAttribute("tabindex", "0");
	const icon = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
	icon.className = "compact-menu-icon";
	icon.setAttribute("aria-hidden", "true");
	button.append(icon);
	const popup = doc.createXULElement("menupopup");
	popup.id = "compact-menu-popup";
	const separator = doc.createXULElement("menuseparator");
	const toggle = doc.createXULElement("menuitem");
	toggle.id = "compact-menu-toggle";
	toggle.setAttribute("type", "checkbox");
	toggle.setAttribute("autocheck", "false");
	toggle.setAttribute("label", "Show menu bar");
	popup.append(separator, toggle);
	button.append(popup);
	tabRow.prepend(button);
	const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
	style.textContent = `
    #titlebar[data-compact-menu-hidden]{display:none!important}
    #zotero-tabs-toolbar > .titlebar-buttonbox{align-self:stretch}
    #compact-menu-button{color:inherit;box-sizing:border-box;min-width:28px;width:28px;max-width:28px;height:28px;margin-block:2px;margin-inline:6px 5px;align-self:center;justify-content:center;padding:5px;border-radius:4px;-moz-window-dragging:no-drag}
    #compact-menu-button + #tab-bar-container{--safe-area-start:0px}
    #compact-menu-button > .toolbarbutton-icon,
    #compact-menu-button > .toolbarbutton-text,
    #compact-menu-button > .toolbarbutton-menu-dropmarker{display:none}
    #compact-menu-button .compact-menu-icon{display:block;width:14px;height:12px;flex-shrink:0;pointer-events:none;background:linear-gradient(currentColor,currentColor) top/100% 2px no-repeat,linear-gradient(currentColor,currentColor) center/100% 2px no-repeat,linear-gradient(currentColor,currentColor) bottom/100% 2px no-repeat}
  `;
	doc.documentElement.append(style);
	function shown() {
		return Services.prefs.getBoolPref(PREF, false);
	}
	const headings = [];
	function collectMenus() {
		restoreMenus();
		for (const menu of [...menubar.children]) {
			if (menu.localName !== "menu") continue;
			if (!shown()) {
				move(menu, popup, separator);
				continue;
			}
			// Keep the visible bar's headings in place. Only lend the native popup
			// to a temporary heading; never duplicate commands, IDs or handlers.
			const content = [...menu.children].find(child => child.localName === "menupopup");
			if (!content) continue;
			const heading = doc.createXULElement("menu");
			for (const attr of ["label", "accesskey", "disabled", "hidden"]) {
				if (menu.hasAttribute(attr)) heading.setAttribute(attr, menu.getAttribute(attr));
			}
			popup.insertBefore(heading, separator);
			headings.push(heading);
			move(content, heading);
		}
	}
	function restoreMenus() {
		for (const node of placements.keys()) if (node !== controls) restore(node);
		for (const heading of headings.splice(0)) heading.remove();
	}
	function refresh() {
		const visible = shown();
		toggle.setAttribute("checked", String(visible));
		titlebar.toggleAttribute("data-compact-menu-hidden", !visible);
		if (visible) {
			restore(controls);
			if (popup.state !== "open" && popup.state !== "showing") restoreMenus();
		} else {
			collectMenus();
			move(controls, toolbar);
		}
	}
	function opening(event) {
		if (event.target === popup) {
			collectMenus();
			toggle.setAttribute("checked", String(shown()));
		}
	}
	function closing(event) {
		if (event.target === popup && shown()) restoreMenus();
	}
	function command() {
		Services.prefs.setBoolPref(PREF, !shown());
	}
	popup.addEventListener("popupshowing", opening);
	popup.addEventListener("popuphidden", closing);
	toggle.addEventListener("command", command);
	function cleanup() {
		popup.hidePopup();
		popup.removeEventListener("popupshowing", opening);
		popup.removeEventListener("popuphidden", closing);
		toggle.removeEventListener("command", command);
		restoreMenus();
		restore(controls);
		for (const anchor of placements.values()) anchor.remove();
		titlebar.removeAttribute("data-compact-menu-hidden");
		button.remove();
		style.remove();
		win.removeEventListener("unload", unload);
		windows.delete(win);
	}
	function unload() {
		cleanup();
	}
	windows.set(win, { refresh, cleanup });
	win.addEventListener("unload", unload, { once: true });
	refresh();
}
var observer = {
	observe() {
		for (const entry of windows.values()) entry.refresh();
	},
};
async function startup() {
	const current = ++generation;
	stopped = false;
	await Zotero.initializationPromise;
	await Zotero.uiReadyPromise;
	if (stopped || current !== generation) return;
	Services.prefs.addObserver(PREF, observer);
	observing = true;
	for (const win of Zotero.getMainWindows()) attach(win);
}
function onMainWindowLoad({ window }) {
	attach(window);
}
function onMainWindowUnload({ window }) {
	windows.get(window)?.cleanup();
}
function shutdown() {
	stopped = true;
	generation++;
	if (observing) Services.prefs.removeObserver(PREF, observer);
	observing = false;
	for (const entry of [...windows.values()]) entry.cleanup();
}
function install() {}
function uninstall() {}
