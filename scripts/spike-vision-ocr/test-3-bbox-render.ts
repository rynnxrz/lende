/**
 * BRIEF-53 spike — Step 5: Test 3 bbox overlay
 *
 * Reads `output/page-{N}.jpg` + `output/test-1-page-{N}.json`. For each detected
 * item, derives a rectangle from `position` (9-grid) + `approx_size` (frac of
 * page area), draws a half-transparent red overlay + white label with the item id.
 *
 * Output: 3 PNGs to `tracker/brief-53-spike-finding/bbox-overlay-page-{N}.png`.
 *
 * Implementation: SVG overlay → composite via `sharp` (already in deps). No
 * canvas / no puppeteer — keeps the dep graph minimal.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const OUTPUT_DIR = join(__dirname, 'output');
const FINDING_DIR = join(__dirname, '..', '..', 'tracker', 'brief-53-spike-finding');

const POSITION_GRID: Record<string, { col: number; row: number }> = {
  'top-left': { col: 0, row: 0 },
  'top-center': { col: 1, row: 0 },
  'top-right': { col: 2, row: 0 },
  'middle-left': { col: 0, row: 1 },
  'middle-center': { col: 1, row: 1 },
  'middle-right': { col: 2, row: 1 },
  'bottom-left': { col: 0, row: 2 },
  'bottom-center': { col: 1, row: 2 },
  'bottom-right': { col: 2, row: 2 },
};

interface DetectedItem {
  id: string;
  type: string;
  visual_description: string;
  visible_text?: string;
  position: keyof typeof POSITION_GRID;
  approx_size: number;
}

function bboxFromGrid(item: DetectedItem, w: number, h: number) {
  const cell = POSITION_GRID[item.position] ?? POSITION_GRID['middle-center'];
  // approx_size is fraction of total page area; treat as square for spike.
  const areaPx = item.approx_size * w * h;
  const side = Math.sqrt(areaPx);
  // Cell center in grid (3×3 grid).
  const cx = (cell.col + 0.5) * (w / 3);
  const cy = (cell.row + 0.5) * (h / 3);
  // Clamp so the bbox doesn't escape the page.
  const x = Math.max(0, Math.min(w - side, cx - side / 2));
  const y = Math.max(0, Math.min(h - side, cy - side / 2));
  return { x, y, w: side, h: side };
}

async function renderPage(jpegPath: string, items: DetectedItem[], outPath: string) {
  const meta = await sharp(jpegPath).metadata();
  const w = meta.width!;
  const h = meta.height!;

  const rects = items.map((it) => {
    const { x, y, w: rw, h: rh } = bboxFromGrid(it, w, h);
    return `
      <rect x="${x}" y="${y}" width="${rw}" height="${rh}"
        fill="rgba(220, 38, 38, 0.35)" stroke="#dc2626" stroke-width="3" />
      <rect x="${x + 6}" y="${y + 6}" width="${Math.min(140, rw - 12)}" height="22"
        fill="rgba(255,255,255,0.95)" stroke="#dc2626" stroke-width="1" />
      <text x="${x + 14}" y="${y + 22}" font-family="Helvetica, Arial, sans-serif"
        font-size="14" font-weight="bold" fill="#7f1d1d">${it.id} · ${it.type}</text>`;
  }).join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${rects}</svg>`;

  await sharp(jpegPath)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(outPath);
}

async function main() {
  // Render up to 3 pages — DoD requires ≥ 3 PNGs.
  const pagesToRender = [1, 2, 3];
  for (const idx of pagesToRender) {
    const jpegPath = join(OUTPUT_DIR, `page-${idx}.jpg`);
    const jsonPath = join(OUTPUT_DIR, `test-1-page-${idx}.json`);
    const outPath = join(FINDING_DIR, `bbox-overlay-page-${idx}.png`);
    if (!existsSync(jpegPath) || !existsSync(jsonPath)) {
      console.warn(`[skip] page ${idx}: missing inputs`);
      continue;
    }
    const items = JSON.parse(readFileSync(jsonPath, 'utf8')) as DetectedItem[];
    await renderPage(jpegPath, items, outPath);
    console.log(`wrote ${outPath} (${items.length} bboxes)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
