#!/usr/bin/env python3
"""
BRIEF-54 v3 dev helper — seed local Supabase with the IVYJSTUDIO inventory
snapshot (`scripts/spike-vision-ocr/inventory-snapshot.json`) so the
ingest CLI + admin editor have realistic data to match against locally.

Skipped if the local DB already has ≥ 90 items in the ivyjstudio org.

Usage:
    .venv-lookbook/bin/python3 scripts/seed-local-items.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = REPO_ROOT / "scripts" / "spike-vision-ocr" / "inventory-snapshot.json"
DB_CONTAINER = "supabase_db_lende"

ORG_SLUG = "ivyjstudio"


def psql(sql: str) -> str:
    proc = subprocess.run(
        ["docker", "exec", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres",
         "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True, text=True, check=False,
    )
    if proc.returncode != 0:
        raise SystemExit(f"psql failed: {proc.stderr.strip()}\nsql={sql[:200]}")
    return proc.stdout.strip()


def main() -> int:
    if not SNAPSHOT.exists():
        sys.exit(f"snapshot missing: {SNAPSHOT}")

    org_id = psql(f"SELECT id FROM organizations WHERE slug='{ORG_SLUG}'")
    if not org_id:
        sys.exit(f"org {ORG_SLUG} not in local DB")
    print(f"[seed] local org_id={org_id}")

    existing = int(psql(f"SELECT count(*) FROM items WHERE organization_id='{org_id}'"))
    if existing >= 90:
        print(f"[seed] skip — local already has {existing} items for {ORG_SLUG}")
        return 0

    items = json.loads(SNAPSHOT.read_text())
    if not isinstance(items, list):
        items = items.get("items", [])

    inserted = 0
    for it in items:
        item_id = (it.get("id") or "").replace("'", "''")
        sku = (it.get("sku") or "").replace("'", "''")
        name = (it.get("name") or "").replace("'", "''")
        description = (it.get("description") or "").replace("'", "''")
        category = (it.get("category") or "").replace("'", "''")
        rental_price = it.get("rental_price") or 50
        replacement_cost = it.get("replacement_cost") or 500
        if not sku or not item_id:
            continue
        # Preserve the prod UUID so spike artifacts (vision mapping JSON, etc.)
        # that reference these IDs continue to resolve locally. ON CONFLICT (sku)
        # updates only the org_id / id to handle re-seeding cleanly.
        sql = (
            f"INSERT INTO items (id, organization_id, sku, name, description, category, "
            f"rental_price, replacement_cost, status) VALUES ("
            f"'{item_id}', '{org_id}', '{sku}', '{name}', '{description}', '{category}', "
            f"{rental_price}, {replacement_cost}, 'active') "
            f"ON CONFLICT (sku) DO UPDATE SET id = EXCLUDED.id, "
            f"organization_id = EXCLUDED.organization_id, name = EXCLUDED.name"
        )
        try:
            psql(sql)
            inserted += 1
        except SystemExit as e:
            print(f"[seed] WARN sku={sku!r} failed: {e}")

    final = int(psql(f"SELECT count(*) FROM items WHERE organization_id='{org_id}'"))
    print(f"[seed] inserted/updated {inserted}; total items now = {final}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
