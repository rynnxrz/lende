/**
 * BRIEF-53 spike — Step 4.2: Pull IVYJSTUDIO inventory snapshot
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local,
 * queries `items` joined with `organizations` where slug='ivyjstudio',
 * dumps to `scripts/spike-vision-ocr/inventory-snapshot.json` (gitignored).
 *
 * Spike uses remote Supabase (Singapore prod) instead of `supabase start` (local)
 * to avoid 5-min boot + a known intermittent issue described in BRIEF-47 §7. The
 * inventory is read-only here; no migrations / no writes.
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ENV_PATH = join(__dirname, '..', '..', '.env.local');

function loadEnvLocal(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const raw = readFileSync(ENV_PATH, 'utf8');
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return out;
}

async function main() {
  const env = { ...loadEnvLocal(), ...process.env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // 1. find ivyjstudio org_id
  const { data: orgs, error: orgErr } = await supabase
    .from('organizations')
    .select('id, slug')
    .eq('slug', 'ivyjstudio')
    .limit(1);
  if (orgErr || !orgs || orgs.length === 0) {
    console.error('ivyjstudio org not found:', orgErr);
    process.exit(1);
  }
  const orgId = orgs[0].id;

  // 2. pull items — adjust column list if schema differs (image_url may be cover_image / photo_url)
  const { data: items, error: itemsErr } = await supabase
    .from('items')
    .select('id, sku, name, description, image_url, category, status')
    .eq('organization_id', orgId)
    .limit(500);
  if (itemsErr) {
    console.error('items query failed:', itemsErr);
    process.exit(1);
  }

  const out = {
    snapshot_at: new Date().toISOString(),
    organization: { id: orgId, slug: 'ivyjstudio' },
    item_count: items?.length ?? 0,
    items: items ?? [],
  };
  const outPath = join(__dirname, 'inventory-snapshot.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`wrote ${out.item_count} items → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
