"""Package a locally built completion preview without publishing a release."""
import json
from pathlib import Path
import sys
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
output = Path(sys.argv[1]).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
manifest = json.loads((root / "manifest.json").read_text())
manifest["name"] = "LaTeX Suite"
# Zotero requires an update URL even for local builds. An empty fork-owned
# feed prevents the official release stream from replacing this preview.
manifest["applications"]["zotero"]["update_url"] = "https://raw.githubusercontent.com/yuukibarns/zotero-latex-suite/feat/latex-completion/completion-updates.json"
manifest["applications"]["zotero"]["strict_min_version"] = "10.0"
for field in ("id", "update_url", "strict_max_version"):
    assert manifest["applications"]["zotero"].get(field), f"Zotero requires {field}"
files = [
    "suite-modules.js", "modules/compact-menu/bootstrap.js",
    "modules/page-tools/bootstrap.js", "modules/page-tools/page-tools.js",
    "modules/backlinks/bootstrap.js", "modules/backlinks/LICENSE",
    "modules/tikzcd/bootstrap.js", "modules/tikzcd/content/note.js", "modules/tikzcd/vendor/quiver/LICENSE",
    "bootstrap.js", "icon.svg", "prefs.xhtml", "prefs.js", "prefs.css",
    "LICENSE", "COMPLETR-LICENSE", "PROSEMIRROR-LICENSE", "HIGHLIGHTJS-LICENSE", "CODEMIRROR-LICENSE", "build/content-script.js", "build/render.js",
    "src/default_snippets.js", "src/default_snippet_variables.js",
    "vendor/katex.min.js", "vendor/KATEX-LICENSE",
]
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    archive.writestr("manifest.json", json.dumps(manifest, indent=2) + "\n")
    for file in files:
        archive.write(root / file, file)
print(output)
