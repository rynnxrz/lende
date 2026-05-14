#!/usr/bin/env python3
"""
BRIEF-53 v2 Test 3 — bbox overlay renderer (Python / PIL fallback)

Reads `output/page-{N}.jpg` + `output/test-1-page-{N}.json` (Test 1 output).
For each detected item, derives a rectangle from `position` (9-grid) + `approx_size`
(fraction of page area), draws a half-transparent red overlay + white label box
with item id and type.

Output: 3 PNGs to `tracker/brief-53-spike-finding/bbox-overlay-page-{N}.png`.

This is the v2 spike-day fallback: the canonical scripts/spike-vision-ocr/test-3-bbox-render.ts
uses `sharp`, which has no prebuilt linux-arm64 binary on the spike sandbox. The PIL version
produces identical output (same 9-grid math, same approx_size→side derivation).
"""

import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent.parent  # repo root
OUTPUT_DIR = ROOT / 'scripts' / 'spike-vision-ocr' / 'output'
FINDING_DIR = ROOT / 'tracker' / 'brief-53-spike-finding'

POSITION_GRID = {
    'top-left': (0, 0),     'top-center': (1, 0),     'top-right': (2, 0),
    'middle-left': (0, 1),  'middle-center': (1, 1),  'middle-right': (2, 1),
    'bottom-left': (0, 2),  'bottom-center': (1, 2),  'bottom-right': (2, 2),
}

def bbox_from_grid(item, w, h):
    col, row = POSITION_GRID.get(item.get('position'), POSITION_GRID['middle-center'])
    area_px = max(0.005, float(item.get('approx_size', 0.02))) * w * h
    side = area_px ** 0.5
    cx = (col + 0.5) * (w / 3)
    cy = (row + 0.5) * (h / 3)
    x = max(0, min(w - side, cx - side / 2))
    y = max(0, min(h - side, cy - side / 2))
    return int(x), int(y), int(x + side), int(y + side)


def render_page(jpeg_path: Path, items: list, out_path: Path):
    img = Image.open(jpeg_path).convert('RGBA')
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 14)
    except OSError:
        font = ImageFont.load_default()

    for it in items:
        x1, y1, x2, y2 = bbox_from_grid(it, img.width, img.height)
        draw.rectangle((x1, y1, x2, y2), fill=(220, 38, 38, 90), outline=(220, 38, 38, 255), width=3)
        label = f"{it.get('id','?')} · {it.get('type','?')}"
        # Background rectangle for the label
        lw = min(180, x2 - x1 - 12)
        if lw < 60: lw = 60
        draw.rectangle((x1 + 6, y1 + 6, x1 + 6 + lw, y1 + 28),
                       fill=(255, 255, 255, 240), outline=(220, 38, 38, 255), width=1)
        draw.text((x1 + 12, y1 + 9), label, fill=(127, 29, 29, 255), font=font)

    out = Image.alpha_composite(img, overlay).convert('RGB')
    out.save(out_path, format='PNG')


def main():
    FINDING_DIR.mkdir(parents=True, exist_ok=True)
    pages = [1, 2, 3]  # DoD requires ≥ 3 PNGs; first three are diverse layouts
    for idx in pages:
        jpeg = OUTPUT_DIR / f'page-{idx}.jpg'
        json_in = OUTPUT_DIR / f'test-1-page-{idx}.json'
        out = FINDING_DIR / f'bbox-overlay-page-{idx}.png'
        if not jpeg.exists() or not json_in.exists():
            print(f'[skip] page {idx}: missing {jpeg.name} or {json_in.name}')
            continue
        items = json.load(open(json_in))
        render_page(jpeg, items, out)
        print(f'wrote {out} ({len(items)} bboxes)')


if __name__ == '__main__':
    main()
