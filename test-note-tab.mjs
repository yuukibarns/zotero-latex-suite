import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";
const source = readFileSync("bootstrap.js", "utf8");
const win = new JSDOM(
	'<div class="context-pane-list-popup" data-item-id="123"><button class="context-pane-list-edit-in-window"></button></div>',
).window;
win.document.createXULElement = name => win.document.createElement(name);
const calls = [];
const context = vm.createContext({ Zotero: { Notes: { open: async (...args) => calls.push(args) } } });
vm.runInContext(
	source.slice(source.indexOf("const noteTabMenus ="), source.indexOf("function onMainWindowLoad")),
	context,
);
context.window = win;
vm.runInContext("installNoteTabMenu(window)", context);
const popup = win.document.querySelector(".context-pane-list-popup");
popup.dispatchEvent(new win.Event("popupshowing", { bubbles: true }));
popup.dispatchEvent(new win.Event("popupshowing", { bubbles: true }));
assert.equal(popup.querySelectorAll(".latex-suite-edit-note-tab").length, 1);
popup.querySelector(".latex-suite-edit-note-tab").dispatchEvent(new win.Event("command"));
assert.equal(calls[0][0], 123);
assert.equal(calls[0][2].openInWindow, false);
popup.dataset.itemId = "456";
popup.querySelector(".latex-suite-edit-note-tab").dispatchEvent(new win.Event("command"));
assert.equal(calls[1][0], 456, "uses current popup target");
vm.runInContext("noteTabMenus.get(window)()", context);
assert.equal(popup.querySelector(".latex-suite-edit-note-tab"), null);
win.close();
console.log("Note list tab action target, duplicate prevention, and cleanup passed.");
