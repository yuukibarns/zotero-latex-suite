import { App } from './app';
import { createPlatform, type ZoteroAPI } from './adapter';
declare const Zotero: ZoteroAPI;
let app: App | undefined;
export function startup({id}: {id: string}): void {
  app?.stop();
  app = new App(createPlatform(Zotero, id)); app.start();
}
export function shutdown(): void { app?.stop(); app = undefined; }
export function install(): void { /* Zotero lifecycle hook. */ }
export function uninstall(): void { /* No persistent state to remove. */ }
