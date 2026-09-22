"""Package a locally built completion preview without publishing a release."""
import json
from pathlib import Path
import sys
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
output = Path(sys.argv[1]).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
manifest = json.loads((root / "manifest.json").read_text())
manifest["name"] = "LaTeX Suite (Completion Preview)"
manifest["version"] = "0.5.3.1"
manifest["applications"]["zotero"].pop("update_url", None)
manifest["applications"]["zotero"]["strict_min_version"] = "10.0"
files = [
    "bootstrap.js", "icon.svg", "prefs.xhtml", "prefs.js", "prefs.css",
    "LICENSE", "COMPLETR-LICENSE", "build/content-script.js", "build/render.js",
    "src/default_snippets.js", "src/default_snippet_variables.js",
    "vendor/katex.min.js", "vendor/KATEX-LICENSE",
]
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    archive.writestr("manifest.json", json.dumps(manifest, indent=2) + "\n")
    for file in files:
        archive.write(root / file, file)
print(output)
