import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
for (const readyState of ["loading", "complete"]) {
 let onLoad, calls = 0;
 const viewer = {
  document: {readyState},
  PrintUtils: {getPrintSettings(...args) { calls++; return {printerName:args[0],toFileName:"chosen.pdf"}; }},
  addEventListener(type, callback, options) {assert.equal(type,"load");assert.ok(options.once);onLoad=callback;}
 };
 const context = vm.createContext({Zotero:{openInViewer(uri,options) {
  assert.ok(uri.startsWith("data:text/html"));
  assert.equal(options.allowJavaScript,false);
  return viewer;
 }}});
 vm.runInContext(readFileSync("bootstrap.js","utf8"),context);
 vm.runInContext('diagnoseNotePrint("<!doctype html><p>Test</p>")',context);
 if (onLoad) onLoad();
 const settings = viewer.PrintUtils.getPrintSettings("PDF");
 assert.equal(calls,1);
 assert.equal(settings.printerName,"PDF");
 assert.equal(settings.toFileName,"chosen.pdf");
 assert.equal(settings.printBGColors,true); assert.equal(settings.printBGImages,true);
 for (const position of ["Left","Center","Right"]) {
  assert.equal(settings["headerStr"+position],"");
  assert.equal(settings["footerStr"+position],"");
 }
 for (const side of ["Top","Bottom","Left","Right"]) assert.equal(settings["margin"+side],0);
}
console.log("Viewer print settings preserve filename/printer and remove browser margins/headers.");
