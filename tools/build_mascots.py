#!/usr/bin/env python3
"""Rebuild the web-ready mascot images from the design sources.

    python3 tools/build_mascots.py

Reads   design/mascots/source/*.png   (the full-size originals)
Writes  public/img/mascots/*.webp     (small, transparent, used by the app)

Two kinds of source:
  1. Single transparent PNGs (host.png, explorer.png, champion.png).
     Faint alpha is cleaned, the image is trimmed and scaled to MAX_SIDE.
  2. The expression sheet (expressions-sheet.png) on a cream background.
     The background is removed with a flood fill from the border, then each
     expression is cut out using the boxes in SHEET_CELLS below.

To add or replace art: drop the PNG into design/mascots/source/, add it to
SINGLES or SHEET_CELLS if it is new, run this script, check the result in
/avatars.html, commit.

Needs: pip install pillow numpy scipy
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "design" / "mascots" / "source"
OUT = ROOT / "public" / "img" / "mascots"
MAX_SIDE = 640        # px, longest side of the web image
ALPHA_FLOOR = 16      # alpha below this becomes fully transparent (kills grey haze)
WEBP_QUALITY = 90

# Single transparent PNGs: source file -> output name
SINGLES = {"host.png": "host", "explorer.png": "explorer", "champion.png": "champion"}

# Expression sheet: output name -> (left, top, right, bottom) in sheet pixels.
# The bottom row holds 3 expressions per mascot (happy, thinking, surprised).
SHEET = "expressions-sheet.png"
_ROW = (650, 930)
_GROUPS = {"host": (20, 499), "explorer": (525, 1010), "champion": (1038, 1518)}
SHEET_CELLS = {}
for who, (x0, x1) in _GROUPS.items():
    third = (x1 - x0) / 3
    for i, mood in enumerate(["happy", "thinking", "surprised"]):
        SHEET_CELLS[f"{who}-{mood}"] = (round(x0 + i * third), _ROW[0], round(x0 + (i + 1) * third), _ROW[1])


def clean_and_save(im: Image.Image, name: str) -> None:
    im = im.convert("RGBA")
    a = np.array(im)
    a[..., 3][a[..., 3] < ALPHA_FLOOR] = 0
    im = Image.fromarray(a)
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    path = OUT / f"{name}.webp"
    im.save(path, "WEBP", quality=WEBP_QUALITY, method=6)
    print(f"  {path.relative_to(ROOT)}  {im.size[0]}x{im.size[1]}  {path.stat().st_size // 1024} KB")


def remove_sheet_background(im: Image.Image) -> Image.Image:
    """Make the cream background (and its soft lavender shadows) transparent."""
    rgb = np.array(im.convert("RGB")).astype(int)
    bg = np.array(rgb[5, 5])                        # cream sampled from the corner
    dist = np.abs(rgb - bg).sum(axis=2)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    shadow = (r > 180) & (b > 170) & (g > 140) & (r - g > 15) & (b - g > 10)
    candidate = (dist < 60) | shadow
    labels, _ = ndimage.label(candidate)
    border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    background = np.isin(labels, list(border))
    # soften a 1px fringe so edges do not look jagged on dark screens
    fringe = ndimage.binary_dilation(background) & ~background
    alpha = np.where(background, 0, 255).astype(np.uint8)
    alpha[fringe] = 140
    out = np.dstack([rgb.astype(np.uint8), alpha])
    return Image.fromarray(out, "RGBA")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    print("Single mascots")
    for src, name in SINGLES.items():
        if (SRC / src).exists():
            clean_and_save(Image.open(SRC / src), name)
    if (SRC / SHEET).exists():
        print("Expressions")
        cut = remove_sheet_background(Image.open(SRC / SHEET))
        for name, box in SHEET_CELLS.items():
            clean_and_save(cut.crop(box), name)


if __name__ == "__main__":
    main()
