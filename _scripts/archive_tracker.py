#!/usr/bin/env python3
"""
Archive done briefs + old LOG entries from tracker/ to tracker/archive/.

Briefs strategy:
  - Parse the status overview table at top of BRIEFS.md (the markdown table).
  - Identify rows where status is in ARCHIVE_STATUSES.
  - Move those table rows + their corresponding ## BRIEF-XX detail sections to archive.

LOG strategy:
  - Move ## YYYY-MM-DD ... entries older than --days days to archive.

Usage:
  python3 _scripts/archive_tracker.py --briefs
  python3 _scripts/archive_tracker.py --log --days 7
  python3 _scripts/archive_tracker.py --all
"""
import argparse
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRACKER = ROOT / "tracker"
ARCHIVE = TRACKER / "archive"
BRIEFS = TRACKER / "BRIEFS.md"
LOG = TRACKER / "LOG.md"

ARCHIVE_STATUSES = {"DONE", "INVALIDATED", "REJECTED", "DEFERRED", "MERGED", "SUPERSEDED"}
ARCHIVE_TOKENS = ARCHIVE_STATUSES | {"REJECTED — DONE"}  # variant phrasings


def archive_briefs():
    ARCHIVE.mkdir(exist_ok=True)
    text = BRIEFS.read_text(encoding="utf-8")

    # 1. Parse status table: find rows with brief id + status
    archive_ids = _ids_to_archive_from_overview(text)
    if not archive_ids:
        print("No briefs flagged for archive in overview table.")
        return

    # 2. Split into sections by `^## ` headings, classify each
    parts = re.split(r"(?m)^(?=## )", text)
    header = parts[0]
    sections = parts[1:]

    keep_sections = []
    archived_sections = []

    for sec in sections:
        first_line = sec.split("\n", 1)[0]
        m = re.match(r"## (BRIEF-[0-9A-Za-z]+)", first_line)
        if not m:
            # not a brief section (e.g. status overview, dependency chain notes)
            keep_sections.append(sec)
            continue
        brief_id = m.group(1)
        if brief_id in archive_ids:
            archived_sections.append(sec)
        else:
            keep_sections.append(sec)

    # 3. Strip archived rows from the status overview table — could be in `header` or
    # in any kept section (the "## 状态总览" heading lives in a kept section).
    new_header, removed_from_header = _strip_archived_rows_from_overview(header, archive_ids)
    new_keep_sections = []
    archived_rows = list(removed_from_header)
    for sec in keep_sections:
        new_sec, removed = _strip_archived_rows_from_overview(sec, archive_ids)
        archived_rows.extend(removed)
        new_keep_sections.append(new_sec)
    keep_sections = new_keep_sections

    # 4. Write archive
    quarter = _current_quarter()
    archive_path = ARCHIVE / f"briefs-archive-{quarter}.md"
    existing = ""
    if archive_path.exists():
        existing = archive_path.read_text(encoding="utf-8")
    else:
        existing = f"# Briefs Archive — {quarter}\n\nArchived from tracker/BRIEFS.md by archive_tracker.py.\n\n---\n\n"

    archive_content = existing
    if archived_rows:
        archive_content += "## Archived overview rows\n\n```\n" + "\n".join(archived_rows) + "\n```\n\n---\n\n"
    archive_content += "".join(archived_sections)
    archive_path.write_text(archive_content, encoding="utf-8")

    # 5. Rewrite BRIEFS.md
    BRIEFS.write_text(new_header + "".join(keep_sections), encoding="utf-8")

    print(f"Archived {len(archived_sections)} brief sections + {len(archived_rows)} overview rows → {archive_path}")
    print(f"  IDs: {sorted(archive_ids)}")


def _ids_to_archive_from_overview(text: str) -> set:
    """Parse the markdown status table at top of BRIEFS.md, return brief IDs whose status indicates archive."""
    archive_ids = set()
    # Look for table rows like `| <ord> | BRIEF-XX | ... | <status> | ...`
    # Brief ID column is column 2 (index 2 after split by `|`)
    # Status column is column 4 in the lende table
    for line in text.splitlines():
        if not line.startswith("|"):
            continue
        cols = [c.strip() for c in line.split("|")]
        if len(cols) < 5:
            continue
        # find a column that looks like BRIEF-XX
        brief_col = None
        for c in cols:
            m = re.match(r"^(BRIEF-[0-9A-Za-z]+)(\s|$)", c)
            if m:
                brief_col = m.group(1)
                break
        if not brief_col:
            continue
        # combine all remaining columns for status keyword search (status phrasing varies)
        row_text = " | ".join(cols).upper()
        if any(tok in row_text for tok in ARCHIVE_TOKENS):
            # be careful: skip if the row contains both DONE and an active marker like IN_PROGRESS / READY / PENDING
            if any(active in row_text for active in (" IN_PROGRESS ", " READY ", " PENDING ", " BLOCKED ", " IN PROGRESS ")):
                continue
            archive_ids.add(brief_col)
    return archive_ids


def _strip_archived_rows_from_overview(header: str, archive_ids: set):
    """Remove table rows whose **brief ID column** matches an archived ID.

    Important: only check the row's id column (typically column 2 of the markdown table),
    NOT the entire row body. Otherwise rows mentioning archived briefs in `blocked_by`
    or other columns get over-removed.
    """
    new_lines = []
    removed = []
    for line in header.splitlines(keepends=True):
        if line.startswith("|"):
            cols = [c.strip() for c in line.split("|")]
            # find the brief id col (first col matching ^BRIEF-XXX...)
            row_brief_id = None
            for c in cols:
                m = re.match(r"^(BRIEF-[0-9A-Za-z]+)(\s|$)", c)
                if m:
                    row_brief_id = m.group(1)
                    break
            if row_brief_id and row_brief_id in archive_ids:
                removed.append(line.strip())
                continue
        new_lines.append(line)
    return "".join(new_lines), removed


def archive_log(days: int = 7):
    ARCHIVE.mkdir(exist_ok=True)
    text = LOG.read_text(encoding="utf-8")

    parts = re.split(r"(?m)^(?=## \d{4}-\d{2}-\d{2})", text)
    header = parts[0]
    entries = parts[1:]

    cutoff = datetime.now() - timedelta(days=days)

    keep = [header]
    archived = []

    for entry in entries:
        m = re.match(r"## (\d{4}-\d{2}-\d{2})", entry)
        if not m:
            keep.append(entry)
            continue
        try:
            entry_date = datetime.strptime(m.group(1), "%Y-%m-%d")
        except ValueError:
            keep.append(entry)
            continue
        if entry_date < cutoff:
            archived.append(entry)
        else:
            keep.append(entry)

    if not archived:
        print(f"No LOG entries older than {days} days.")
        return

    quarter = _current_quarter()
    archive_path = ARCHIVE / f"log-archive-{quarter}.md"
    existing = ""
    if archive_path.exists():
        existing = archive_path.read_text(encoding="utf-8")
    else:
        existing = f"# LOG Archive — {quarter}\n\nArchived from tracker/LOG.md by archive_tracker.py.\n\n---\n\n"

    archive_path.write_text(existing + "".join(archived), encoding="utf-8")
    LOG.write_text("".join(keep), encoding="utf-8")

    print(f"Archived {len(archived)} LOG entries → {archive_path}")


def _current_quarter() -> str:
    now = datetime.now()
    q = (now.month - 1) // 3 + 1
    return f"{now.year}-Q{q}"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--briefs", action="store_true")
    parser.add_argument("--log", action="store_true")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--days", type=int, default=7)
    args = parser.parse_args()

    if args.all or args.briefs:
        archive_briefs()
    if args.all or args.log:
        archive_log(args.days)
    if not (args.briefs or args.log or args.all):
        print(__doc__)
        sys.exit(1)
