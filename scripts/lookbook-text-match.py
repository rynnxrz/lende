#!/usr/bin/env python3
"""
BRIEF-54 v3 — Step 2.5: PDF text extraction + SKU full-text matching.

Reads a PDF that contains an embedded text layer (e.g. exported from
InDesign / Illustrator / Figma rather than a raw scan), extracts every
word with its bounding box, and matches each word against the org's
inventory `sku` column. A hit produces an `auto_matched` candidate with
a hot-zone bbox expanded around the SKU text — jewelry lookbook cards
typically place the SKU directly next to the product image, so the
expanded bbox is a usable first-pass hot-zone for the customer site.

Pages with zero matches are surfaced in `stats.unmatched_pages` and
flow into the vision-only path (admin editor draws bbox manually).

Usage:
    .venv-lookbook/bin/python3 scripts/lookbook-text-match.py \\
        docs/2026SS.pdf ivyjstudio

Output:
    tracker/brief-54-v3-text-match-output/<lookbook-slug>-text-match.json

Dependencies:
    pdfplumber  (pip install pdfplumber)

Reads inventory SKUs from Supabase via the SUPABASE_URL +
SUPABASE_SERVICE_ROLE_KEY env vars (loaded from .env.local).
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_LOCAL = REPO_ROOT / ".env.local"
OUTPUT_DIR = REPO_ROOT / "tracker" / "brief-54-v3-text-match-output"

# bbox expansion: SKU text sits BELOW the product image on a typical
# jewelry card, so we widen modestly horizontally and grow heavily
# upward to cover the image area. From BRIEF-53 spike: card height
# ≈ 8-10× text height, card width ≈ 1.2-1.5× SKU-text width.
BBOX_EXPAND_W = 1.4         # final width = text_w * 1.4
BBOX_EXPAND_H_UP = 9.0      # grow upward by 9x text_h to cover image
BBOX_EXPAND_H_DOWN = 1.0    # extra 1x text_h below for description line

# Default match confidence per method.
CONFIDENCE_EXACT = 0.98
CONFIDENCE_FUZZY = 0.85
CONFIDENCE_TITLE_PARTIAL = 0.70


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    if ENV_LOCAL.exists():
        for line in ENV_LOCAL.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip().strip('"').strip("'")
    # process env wins so callers can `NEXT_PUBLIC_SUPABASE_URL=... python …`
    for k in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    if not env.get("NEXT_PUBLIC_SUPABASE_URL") or not env.get("SUPABASE_SERVICE_ROLE_KEY"):
        sys.exit("[lookbook-text-match] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return env


def fetch_org_skus(env: dict[str, str], org_slug: str) -> tuple[str, list[dict]]:
    base = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not key:
        sys.exit("[lookbook-text-match] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env.local")

    org_url = (
        f"{base.rstrip('/')}/rest/v1/organizations"
        f"?slug=eq.{urllib.parse.quote(org_slug)}&select=id"
    )
    org_req = urllib.request.Request(org_url, headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(org_req, timeout=30) as resp:
        orgs = json.loads(resp.read())
    if not orgs:
        sys.exit(f"[lookbook-text-match] no org with slug={org_slug}")
    org_id = orgs[0]["id"]

    items_url = (
        f"{base.rstrip('/')}/rest/v1/items"
        f"?organization_id=eq.{org_id}&select=id,sku,name&limit=10000"
    )
    items_req = urllib.request.Request(items_url, headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(items_req, timeout=30) as resp:
        items = json.loads(resp.read())
    return org_id, items


def normalize_token(s: str) -> str:
    return re.sub(r"[\s ]+", "", s).upper()


def build_sku_index(items: list[dict]) -> dict[str, dict]:
    """Map normalized-SKU → first item with that SKU."""
    idx: dict[str, dict] = {}
    for it in items:
        sku = (it.get("sku") or "").strip()
        if not sku:
            continue
        idx[normalize_token(sku)] = it
    return idx


def expand_bbox(x0: float, y0: float, x1: float, y1: float,
                page_w: float, page_h: float) -> tuple[float, float, float, float]:
    """Return (bbox_x, bbox_y, bbox_w, bbox_h) in 0..1 fraction-of-page.
    Expands the SKU text bbox into a card-sized hot-zone biased upward
    (the product image sits above the SKU text on a jewelry card)."""
    word_w = max(x1 - x0, 1e-6)
    word_h = max(y1 - y0, 1e-6)

    new_w = min(word_w * BBOX_EXPAND_W, page_w)

    cx = (x0 + x1) / 2
    nx0 = max(0.0, cx - new_w / 2)
    nx1 = min(page_w, nx0 + new_w)
    nx0 = max(0.0, nx1 - new_w)

    # Grow upward (toward y=0 — pdfplumber uses top-origin coordinates)
    # by 9x text_h to cover the image, plus 1x below for any description.
    ny0 = max(0.0, y0 - word_h * BBOX_EXPAND_H_UP)
    ny1 = min(page_h, y1 + word_h * BBOX_EXPAND_H_DOWN)

    bbox_x = round(nx0 / page_w, 4)
    bbox_y = round(ny0 / page_h, 4)
    bbox_w = round((nx1 - nx0) / page_w, 4)
    bbox_h = round((ny1 - ny0) / page_h, 4)
    return bbox_x, bbox_y, bbox_w, bbox_h


def match_pdf(pdf_path: Path, sku_index: dict[str, dict]) -> tuple[list[dict], dict]:
    matches: list[dict] = []
    pages_with_matches: set[int] = set()
    unmatched_pages: list[int] = []

    with pdfplumber.open(str(pdf_path)) as pdf:
        total_pages = len(pdf.pages)
        for i, page in enumerate(pdf.pages, start=1):
            page_w = float(page.width)
            page_h = float(page.height)
            words = page.extract_words(use_text_flow=True) or []

            page_matches = 0
            for w in words:
                token = normalize_token(w.get("text", ""))
                if not token or len(token) < 4:
                    continue
                hit = sku_index.get(token)
                method = "exact_sku"
                confidence = CONFIDENCE_EXACT

                if not hit:
                    # Fuzzy: try stripping common separators and trailing -M / -L size suffixes.
                    # Many lookbook tokens drop the dash-suffix or include extra chars.
                    base_token = re.sub(r"-(M|L|XL|S)$", "", token)
                    if base_token != token and base_token in sku_index:
                        hit = sku_index[base_token]
                        method = "fuzzy_sku"
                        confidence = CONFIDENCE_FUZZY

                if not hit:
                    continue

                bbox_x, bbox_y, bbox_w, bbox_h = expand_bbox(
                    float(w["x0"]), float(w["top"]),
                    float(w["x1"]), float(w["bottom"]),
                    page_w, page_h,
                )

                matches.append({
                    "page_number": i,
                    "inventory_item_id": hit["id"],
                    "sku": hit["sku"],
                    "matched_token_text": w.get("text", ""),
                    "bbox_x": bbox_x,
                    "bbox_y": bbox_y,
                    "bbox_w": bbox_w,
                    "bbox_h": bbox_h,
                    "match_method": method,
                    "confidence": confidence,
                })
                pages_with_matches.add(i)
                page_matches += 1

            if page_matches == 0:
                unmatched_pages.append(i)

    stats = {
        "total_pages": total_pages,
        "pages_with_matches": len(pages_with_matches),
        "total_matches": len(matches),
        "unmatched_pages": unmatched_pages,
    }
    return matches, stats


def main() -> int:
    if len(sys.argv) < 3:
        sys.exit("usage: lookbook-text-match.py <pdf-path> <org-slug> [output-slug]")

    pdf_arg = Path(sys.argv[1])
    org_slug = sys.argv[2].strip()
    output_slug = sys.argv[3].strip() if len(sys.argv) >= 4 else pdf_arg.stem

    pdf_path = pdf_arg if pdf_arg.is_absolute() else (REPO_ROOT / pdf_arg).resolve()
    if not pdf_path.exists():
        sys.exit(f"[lookbook-text-match] PDF not found: {pdf_path}")

    env = load_env()
    org_id, items = fetch_org_skus(env, org_slug)
    sku_index = build_sku_index(items)

    print(f"[lookbook-text-match] org={org_slug} ({org_id}) inventory={len(items)} SKUs={len(sku_index)}")
    print(f"[lookbook-text-match] reading {pdf_path}")

    matches, stats = match_pdf(pdf_path, sku_index)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"{output_slug}-text-match.json"
    payload = {
        "pdf_path": str(pdf_path.relative_to(REPO_ROOT)) if pdf_path.is_relative_to(REPO_ROOT) else str(pdf_path),
        "org_slug": org_slug,
        "org_id": org_id,
        "extracted_at": datetime.now(timezone.utc).isoformat(),
        "matches": matches,
        "stats": stats,
    }
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False))

    print(
        f"[lookbook-text-match] {stats['total_matches']} matches across "
        f"{stats['pages_with_matches']}/{stats['total_pages']} pages → {output_path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
