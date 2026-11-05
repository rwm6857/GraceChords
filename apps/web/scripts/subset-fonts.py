#!/usr/bin/env python3
"""Build the WOFF2 web-font subsets in public/fonts/ from the full TTFs.

Each source font is split, Google-Fonts style, into three files that
src/styles/fonts.css declares with matching `unicode-range`s, so a browser only
downloads the scripts a page actually renders:

  <name>-latin.woff2      Basic Latin + Latin-1 (en, es) + punctuation + ♭ ♮ ♯
  <name>-latin-ext.woff2  Latin Extended (tr, other European languages)
  <name>-rest.woff2       everything else in the font (Cyrillic, Greek, ...)

The TTFs stay as they are: the PDF engine embeds them (src/assets/fonts/) and
the server-side renderers read them from R2.

    python3 -m pip install fonttools brotli
    python3 scripts/subset-fonts.py        # from apps/web/

The printed unicode-range for each -rest file must be pasted into fonts.css.
"""
import subprocess
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

FONTS_DIR = Path(__file__).resolve().parent.parent / 'public' / 'fonts'
SOURCES = [
    'NotoSans-Regular.ttf',
    'NotoSans-Bold.ttf',
    'NotoSansMono-Regular.ttf',
    'NotoSansMono-Bold.ttf',
    'Oswald-SemiBold.ttf',
]

LATIN = ('U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,'
         'U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,'
         'U+2212,U+2215,U+266D-266F,U+FEFF,U+FFFD')
LATIN_EXT = ('U+0100-0130,U+0132-0151,U+0154-02BA,U+02BD-02C5,U+02C7-02CC,'
             'U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,'
             'U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF')


def parse(ranges):
    cps = set()
    for part in ranges.split(','):
        lo, _, hi = part.removeprefix('U+').partition('-')
        cps.update(range(int(lo, 16), int(hi or lo, 16) + 1))
    return cps


def to_ranges(cps):
    out, cps = [], sorted(cps)
    start = prev = cps[0]
    for cp in cps[1:] + [None]:
        if cp is not None and cp == prev + 1:
            prev = cp
            continue
        out.append(f'U+{start:04X}' if start == prev else f'U+{start:04X}-{prev:04X}')
        if cp is not None:
            start = prev = cp
    return ','.join(out)


def subset(src, out, unicodes):
    subprocess.run([
        sys.executable, '-m', 'fontTools.subset', str(src),
        f'--unicodes={unicodes}', '--flavor=woff2', f'--output-file={out}',
        '--layout-features+=locl', '--name-IDs=*', '--notdef-outline',
    ], check=True)


def main():
    covered = parse(LATIN) | parse(LATIN_EXT)
    for name in SOURCES:
        src = FONTS_DIR / name
        stem = src.stem
        rest = set(TTFont(src).getBestCmap()) - covered
        subset(src, FONTS_DIR / f'{stem}-latin.woff2', LATIN)
        subset(src, FONTS_DIR / f'{stem}-latin-ext.woff2', LATIN_EXT)
        rest_range = to_ranges(rest) if rest else None
        if rest_range:
            subset(src, FONTS_DIR / f'{stem}-rest.woff2', rest_range)
        sizes = ', '.join(
            f'{p.name.removeprefix(stem + "-")} {p.stat().st_size // 1024} KiB'
            for p in sorted(FONTS_DIR.glob(f'{stem}-*.woff2')))
        print(f'{name}: {sizes}')
        if rest_range:
            print(f'  rest unicode-range: {rest_range}')


if __name__ == '__main__':
    main()
