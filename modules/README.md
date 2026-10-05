# Suite modules

These are maintained source modules, not downloaded XPIs. The build is fully
self-contained and packages only the runtime files listed in package-local.py.

- `tikzcd`: imported from zotero-tikzcd 0.2.14; pinned Quiver source and MIT
  attribution remain under vendor/quiver. KaTeX labels use katex-zotero 0.16.22.
- `page-tools`: imported from zotero-page-tools 0.1.3.
- `compact-menu`: imported from zotero-compact-menu 0.1.5.
- `backlinks`: imported from zotero-annotation-backlinks 0.2.0-beta.4; MIT license
  retained. Better BibTeX is not included.

The chrome-side manager loads each module in its own scope only when enabled.
All modules have independent teardown. Existing standalone add-ons take
precedence; enabling one stops the integrated copy before its startup. Disabling
or uninstalling it allows the suite copy to start if its setting is enabled.
The manager never disables/uninstalls another add-on or deletes its preferences.

Compact Menu keeps `extensions.compact-menu.showMenuBar`. LaTeX Suite keeps its
existing settings namespace and add-on ID, including snippets and PDF theme.
The other imported modules have no persistent settings to migrate.

## Migrating

Install the unified LaTeX Suite XPI, then disable the four standalone add-ons
(TikZ-CD Preview, PDF Page Tools, Annotation Backlinks, Compact Menu). Their
features continue through the suite. After verification, they can be uninstalled.
Leave Better BibTeX enabled. Module switches are in LaTeX Suite settings; existing
LaTeX editing controls remain unchanged. The note Print / PDF action has its own
switch and theme setting.

## Checks

`npm test` includes the lifecycle/coexistence checks and imported TikZ-CD tests.
`node tests/suite-native.mjs --sidebar` exercises the combined XPI in an isolated
Zotero profile, including sidebar rendering, live preview, PDF export and module
disable/re-enable. It never touches the user's profile.
