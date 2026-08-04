#!/usr/bin/env python3
"""Rebuild the bundled Material Symbols subset fonts for SymbolIcon's Android path.

`src/components/SymbolIcon.tsx` renders Android icons as text from two subset
faces in `assets/fonts/`. Material Symbols ships as one variable font whose
FILL/wght axes React Native cannot drive at runtime, so this script pins two
static instances (FILL=0 -> Outlined, FILL=1 -> Filled) and subsets each down to
only the glyphs the app actually uses.

The glyph vocabulary comes from `SF_TO_MATERIAL` in `src/components/symbolMap.ts`
-- that map is the hand-maintained source of truth. This script reads the `md`
names out of it, writes the two .ttf files, and regenerates the
`MATERIAL_CODEPOINTS` block in the same file so codepoints can never drift from
the fonts.

Workflow when adding an icon:
  1. Add the SF -> Material entry to SF_TO_MATERIAL in symbolMap.ts.
  2. Run this script (from apps/mobile/): python3 scripts/build-symbol-fonts.py
  3. Commit the regenerated symbolMap.ts and both .ttf files.

Requires fonttools (pip install fonttools). The upstream variable font is
downloaded once and cached under .cache/ (gitignored); pass --source to use a
local copy instead.
"""

from __future__ import annotations

import argparse
import re
import sys
import urllib.request
from pathlib import Path

try:
    from fontTools.subset import Options, Subsetter
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
except ImportError:  # pragma: no cover - dependency hint
    sys.exit("fonttools is required: pip install fonttools")

MOBILE_ROOT = Path(__file__).resolve().parent.parent
SYMBOL_MAP = MOBILE_ROOT / "src" / "components" / "symbolMap.ts"
FONT_DIR = MOBILE_ROOT / "assets" / "fonts"
CACHE_DIR = MOBILE_ROOT / ".cache"

UPSTREAM_BASE = (
    "https://raw.githubusercontent.com/google/material-design-icons/master/"
    "variablefont/MaterialSymbolsOutlined%5BFILL%2CGRAD%2Copsz%2Cwght%5D"
)
UPSTREAM_URL = f"{UPSTREAM_BASE}.ttf"
# Upstream's canonical name -> codepoint list. We must use this rather than
# reverse-mapping the font's cmap: Material aliases many glyphs to two
# codepoints (a legacy Material Icons one and a modern one -- `close` sits at
# both E5CD and E14C), so a reverse lookup picks an arbitrary alias and churns
# codepoints that were already correct.
CODEPOINTS_URL = f"{UPSTREAM_BASE}.codepoints"
CACHED_SOURCE = CACHE_DIR / "MaterialSymbolsOutlined-variable.ttf"
CACHED_CODEPOINTS = CACHE_DIR / "MaterialSymbolsOutlined-variable.codepoints"

# The two faces we ship. `opsz=24` is the density the icons are drawn for at our
# call-site sizes (11-24px); `wght=400` is the standard Material bar weight;
# `GRAD=0` is the neutral grade.
FACES = {
    "MaterialSymbolsOutlined": {"FILL": 0, "GRAD": 0, "opsz": 24, "wght": 400},
    "MaterialSymbolsFilled": {"FILL": 1, "GRAD": 0, "opsz": 24, "wght": 400},
}


def read_glyph_names() -> list[str]:
    """Collect every `md:` glyph name from SF_TO_MATERIAL in symbolMap.ts."""
    source = SYMBOL_MAP.read_text()
    block = re.search(
        r"export const SF_TO_MATERIAL[^=]*=\s*\{(.*?)^\}", source, re.S | re.M
    )
    if not block:
        sys.exit(f"Could not find SF_TO_MATERIAL in {SYMBOL_MAP}")
    names = sorted(set(re.findall(r"md:\s*'([a-z0-9_]+)'", block.group(1))))
    if not names:
        sys.exit("SF_TO_MATERIAL parsed but yielded no `md:` glyph names")
    return names


def fetch(explicit: Path | None, cached: Path, url: str, label: str) -> Path:
    if explicit:
        if not explicit.is_file():
            sys.exit(f"--{label} not found: {explicit}")
        return explicit
    if cached.is_file():
        return cached
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading upstream {label} -> {cached.relative_to(MOBILE_ROOT)}")
    urllib.request.urlretrieve(url, cached)
    return cached


def resolve_codepoints(source: Path, table: Path, names: list[str]) -> dict[str, int]:
    """Map each Material glyph name to its canonical upstream codepoint."""
    canonical: dict[str, int] = {}
    for line in table.read_text().splitlines():
        parts = line.split()
        if len(parts) == 2:
            canonical[parts[0]] = int(parts[1], 16)

    missing = [n for n in names if n not in canonical]
    if missing:
        sys.exit(
            "These Material glyph names do not exist upstream (typo, or renamed "
            f"in a newer Material Symbols release): {', '.join(missing)}"
        )

    # Guard against a codepoint the font itself cannot render -- otherwise the
    # subset would silently ship a .notdef box for it.
    cmap = TTFont(source).getBestCmap()
    unmapped = [n for n in names if canonical[n] not in cmap]
    if unmapped:
        sys.exit(f"Codepoints absent from the font's cmap: {', '.join(unmapped)}")

    return {name: canonical[name] for name in names}


def build_face(source: Path, family: str, axes: dict[str, float], codepoints: list[int]) -> None:
    # recalcTimestamp=False keeps head.modified at the upstream font's value
    # instead of stamping save time, so a rebuild from the same inputs is
    # byte-identical and unchanged icons produce no binary diff.
    font = TTFont(source, recalcTimestamp=False)
    instantiateVariableFont(font, axes, inplace=True, updateFontNames=False)

    options = Options()
    options.layout_features = []  # icon ligatures are unused; we address by codepoint
    options.name_IDs = [1, 2, 3, 4, 6]
    options.name_legacy = True
    options.notdef_outline = True
    options.recalc_bounds = True
    options.drop_tables += ["DSIG"]

    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)

    # expo-font registers these faces by family name in app/_layout.tsx, and
    # SymbolIcon selects between them via fontFamily -- so the family/full/
    # PostScript names must match those strings exactly.
    name = font["name"]
    for name_id in (1, 4, 6):
        name.setName(family, name_id, 3, 1, 0x409)
        name.setName(family, name_id, 1, 0, 0)
    name.setName("Regular", 2, 3, 1, 0x409)
    name.setName("Regular", 2, 1, 0, 0)

    out = FONT_DIR / f"{family}.ttf"
    font.save(out)
    print(f"  {out.relative_to(MOBILE_ROOT)}  {out.stat().st_size / 1024:.1f} KB")


def rewrite_codepoints(codepoints: dict[str, int]) -> None:
    """Regenerate the MATERIAL_CODEPOINTS literal in symbolMap.ts."""
    body = "".join(f"  {name}: 0x{cp:04x},\n" for name, cp in sorted(codepoints.items()))
    source = SYMBOL_MAP.read_text()
    updated, count = re.subn(
        r"(export const MATERIAL_CODEPOINTS: Record<string, number> = \{\n).*?(^\})",
        lambda m: m.group(1) + body + m.group(2),
        source,
        count=1,
        flags=re.S | re.M,
    )
    if count != 1:
        sys.exit(f"Could not rewrite MATERIAL_CODEPOINTS in {SYMBOL_MAP}")
    SYMBOL_MAP.write_text(updated)
    print(f"  {SYMBOL_MAP.relative_to(MOBILE_ROOT)}  {len(codepoints)} codepoints")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        help="Local MaterialSymbolsOutlined variable font (default: download + cache)",
    )
    parser.add_argument(
        "--codepoints",
        type=Path,
        help="Local upstream .codepoints file (default: download + cache)",
    )
    args = parser.parse_args()

    names = read_glyph_names()
    source = fetch(args.source, CACHED_SOURCE, UPSTREAM_URL, "variable font")
    table = fetch(args.codepoints, CACHED_CODEPOINTS, CODEPOINTS_URL, "codepoints")
    codepoints = resolve_codepoints(source, table, names)

    print(f"Subsetting {len(names)} glyphs from {source.name}")
    for family, axes in FACES.items():
        build_face(source, family, axes, sorted(codepoints.values()))
    rewrite_codepoints(codepoints)


if __name__ == "__main__":
    main()
