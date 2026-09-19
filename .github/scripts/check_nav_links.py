"""Check that every href in assets/pp-nav.js's DIRECTORY resolves to a real
file in the repo.

pp-nav.js is the single source of truth for the site map (see the comment
at the top of that file) — every folder, section and page link the ribbon
nav renders comes from its DIRECTORY constant. A typo'd or stale href there
silently becomes a dead link in the ribbon on every page of the site, so
this runs in CI rather than waiting for someone to click it in production.

Deliberately a plain regex scan, not a JS interpreter: the repo has no
Node/npm tooling anywhere else, and DIRECTORY's entries are simple enough
(single-quoted string literals) that a full parse would be overkill.
"""

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
NAV_FILE = REPO_ROOT / "assets" / "pp-nav.js"

HREF_RE = re.compile(r"href:\s*'([^']*)'")


def resolve(href):
    """Site-root-relative href -> repo-relative file path, mirroring how
    the live site's server resolves it: a trailing slash means index.html,
    otherwise a missing extension defaults to .html."""

    path = href.split("#")[0].split("?")[0]
    if path.endswith("/"):
        path += "index.html"
    elif not path.endswith(".html"):
        path += ".html"
    return REPO_ROOT / path.lstrip("/")


def main():
    text = NAV_FILE.read_text(encoding="utf-8")
    hrefs = sorted(set(HREF_RE.findall(text)))

    missing = []
    for href in hrefs:
        target = resolve(href)
        if not target.is_file():
            missing.append((href, target.relative_to(REPO_ROOT)))

    print(f"Checked {len(hrefs)} href(s) from {NAV_FILE.relative_to(REPO_ROOT)}")

    if missing:
        print("\nBroken nav link(s):")
        for href, target in missing:
            print(f"  {href}  ->  {target}  (not found)")
        sys.exit(1)

    print("All nav links resolve.")


if __name__ == "__main__":
    main()
