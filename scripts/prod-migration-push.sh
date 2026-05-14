#!/usr/bin/env bash
# BRIEF-55 + BRIEF-54 v3 prod migration push helper.
#
# VPN workaround: direct DB host (db.<ref>.supabase.co) uses postgres STARTTLS
# which many corporate VPNs intercept and break. This script auto-detects the
# failure and falls back to the Supabase connection pooler (pooler.supabase.com)
# which routes through standard TLS that VPNs pass through correctly.
#
# What it does:
#   1. Confirms supabase CLI is logged in and the project is linked.
#   2. Snapshots prod data (`/tmp/lende-prod-pre-migration-<date>.sql`).
#   3. Dry-runs `supabase db push` to show pending migrations.
#   4. After confirmation, runs the real push.
#   5. Verifies that the new RPCs / tables exist via service-role REST API.
#
# Migrations to be pushed (5/10 audit):
#   - 00059_accept_invitation_atomic.sql        (BRIEF-44 phase A)
#   - 00060_invitation_email_citext.sql         (BRIEF-44 phase A)
#   - 00061_seed_org_from_template.sql          (BRIEF-44 phase B1)
#   - 00062_pdf_lookbooks.sql                   (BRIEF-54 v3)
#
# Reads SUPABASE_SERVICE_ROLE_KEY from .env.local for the post-push REST verify.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DATE=$(date +%F)
DRY_LOG="/tmp/lende-prod-push-dryrun-${DATE}.log"
PUSH_LOG="/tmp/lende-prod-push-${DATE}.log"
SNAPSHOT="/tmp/lende-prod-pre-migration-${DATE}.sql"
PROJECT_REF=zigyiqqboiadinelfzxw
POOLER_URL_FILE="supabase/.temp/pooler-url"

if ! command -v supabase >/dev/null 2>&1; then
    echo "[push] supabase CLI not installed. brew install supabase/tap/supabase"
    exit 1
fi

# --- Build DB URL (pooler fallback for VPN environments) ---
DB_URL_ARGS=()

resolve_pooler_url() {
    if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
        echo "[push]   VPN detected — direct DB connection blocked."
        echo "[push]   Falling back to connection pooler (requires DB password)."
        echo "[push]   Find it at: Supabase Dashboard → Settings → Database → Database Password"
        echo
        read -s -p "[push]   Supabase DB Password: " SUPABASE_DB_PASSWORD; echo
        export SUPABASE_DB_PASSWORD
    fi

    if [ ! -f "${POOLER_URL_FILE}" ]; then
        echo "[push] ERROR: ${POOLER_URL_FILE} not found. Run: supabase link --project-ref ${PROJECT_REF}"
        exit 1
    fi

    local pooler_base
    pooler_base="$(cat "${POOLER_URL_FILE}")"
    local pass_enc
    pass_enc="$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "${SUPABASE_DB_PASSWORD}")"
    # Insert password into URL: postgresql://user@host → postgresql://user:pass@host
    POOLER_DB_URL="${pooler_base/@/:${pass_enc}@}"
    DB_URL_ARGS=(--db-url "${POOLER_DB_URL}")
    echo "[push]   Using pooler connection: $(echo "${pooler_base}" | sed 's|postgresql://\([^@]*\)@|postgresql://\1@|')"
}

detect_vpn_block() {
    # Direct DB host TLS handshake — if VPN intercepts postgres STARTTLS, this times out
    if ! timeout 5 bash -c "echo | openssl s_client -connect db.${PROJECT_REF}.supabase.co:5432 -starttls postgres 2>&1 | grep -q 'CONNECTED'" 2>/dev/null; then
        echo "[push]   Direct DB TLS blocked (VPN intercepts postgres STARTTLS on port 5432)."
        return 0  # VPN is blocking
    fi
    return 1  # Direct connection works
}

echo "[push] step 1/5  pre-flight"
supabase projects list \
    | grep -E "^\s*●\s+\|.*${PROJECT_REF}\s+\|" \
    || { echo "[push] project ${PROJECT_REF} is not linked. Run: supabase link --project-ref ${PROJECT_REF}"; exit 1; }

echo "[push]   checking direct DB connectivity..."
if detect_vpn_block; then
    resolve_pooler_url
else
    echo "[push]   direct DB connection OK."
fi

echo "[push] step 2/5  snapshot prod data → ${SNAPSHOT}"
if [ ${#DB_URL_ARGS[@]} -gt 0 ]; then
    echo "[push]   attempting pg_dump via pooler..."
    if /opt/homebrew/opt/libpq/bin/pg_dump "${POOLER_DB_URL}" --data-only --schema=public > "${SNAPSHOT}" 2>/dev/null; then
        wc -l "${SNAPSHOT}"
    else
        echo "[push]   SKIP: pg_dump via pooler also failed."
        echo "[push]   All 4 pending migrations are additive (CREATE FUNCTION / CREATE TABLE / ALTER ADD COLUMN)."
        echo "[push]   Rollback if needed = DROP the new objects. Proceeding without snapshot."
    fi
else
    echo "[push]   attempting pg_dump via supabase CLI (runs in Docker)..."
    if supabase db dump --linked --data-only --schema public > "${SNAPSHOT}" 2>/dev/null; then
        wc -l "${SNAPSHOT}"
    else
        echo "[push]   SKIP: pg_dump failed. Proceeding without snapshot."
    fi
fi

echo "[push] step 3/5  dry-run → ${DRY_LOG}"
supabase db push "${DB_URL_ARGS[@]}" --dry-run --include-all 2>&1 | tee "${DRY_LOG}"
echo
echo "[push] dry-run finished. Inspect ${DRY_LOG} above. Press Enter to push for real, or Ctrl+C to abort."
read -r

echo "[push] step 4/5  real push → ${PUSH_LOG}"
supabase db push "${DB_URL_ARGS[@]}" --include-all 2>&1 | tee "${PUSH_LOG}"

echo "[push] step 5/5  verify schema cache reloaded"
if [ -f .env.local ]; then
    set -a
    # shellcheck disable=SC1091
    source <(grep -E "^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=" .env.local)
    set +a
fi

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    echo "[push] WARN  SUPABASE_SERVICE_ROLE_KEY not in env. Skipping REST verify."
    exit 0
fi

base="https://${PROJECT_REF}.supabase.co"

verify_rpc() {
    local fn="$1"
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
        -X POST "${base}/rest/v1/rpc/${fn}" \
        -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
        -H "Content-Type: application/json" \
        --data '{}')
    case "${code}" in
        200|400|401|422) echo "[push]   rpc/${fn} → ${code} ✓ (callable)";;
        404)             echo "[push]   rpc/${fn} → 404 ✗ (NOT FOUND — push may have skipped this)";;
        *)               echo "[push]   rpc/${fn} → ${code} ?";;
    esac
}

verify_table() {
    local tbl="$1"
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
        "${base}/rest/v1/${tbl}?select=id&limit=1" \
        -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")
    case "${code}" in
        200) echo "[push]   /${tbl} → 200 ✓ (table exists)";;
        404) echo "[push]   /${tbl} → 404 ✗ (table missing — push may have skipped this)";;
        *)   echo "[push]   /${tbl} → ${code} ?";;
    esac
}

verify_rpc accept_invitation_atomic
verify_rpc seed_org_from_template
verify_table pdf_lookbooks
verify_table pdf_lookbook_items

echo "[push] done. If all verify lines show ✓, BRIEF-55 + BRIEF-54 v3 prod schema is live."
echo "[push] next: open https://lende.shipbyx.com/ivyjstudio/lookbook/2026SS to confirm customer URL works."
