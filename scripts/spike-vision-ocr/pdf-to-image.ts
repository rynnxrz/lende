/**
 * BRIEF-53 spike — Step 2: PDF → JPEG converter
 *
 * Reads each PDF in `scripts/spike-vision-ocr/samples/` and writes
 * `scripts/spike-vision-ocr/output/page-{N}.jpg` at 1024 width.
 *
 * Layout-diversity rule: when a sample PDF has > 5 pages, take the first 3
 * pages + 1 obvious collage page + 1 table-style page (≤ 5 total). The 2026-05-08
 * spike pre-selected 5 pages from `2026SS.pdf` (manual: 1, 2, 4, 12, 18) + 1 page
 * from `IvyJStudio-PricingList.pdf` (table-style) to cover three layouts.
 *
 * Production runner: requires `pdf2pic` (preferred — pdftoppm wrapper). The
 * 2026-05-08 spike used `pdftoppm` directly via shell (env had it pre-installed)
 * and skipped the pdf2pic dependency.
 *
 * Usage:
 *   npm i pdf2pic --legacy-peer-deps
 *   npx tsx scripts/spike-vision-ocr/pdf-to-image.ts
 */

import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';

const SAMPLES_DIR = join(__dirname, 'samples');
const OUTPUT_DIR = join(__dirname, 'output');

// (sample basename → page indices to convert) — keeps output deterministic
// across re-runs. Adjust if Rongze adds new lookbook PDFs.
const PAGE_PLAN: Record<string, number[]> = {
  '2026SS.pdf': [1, 2, 4, 12, 18],
  'IvyJStudio-PricingList.pdf': [1],
};

// Output index counter — sequential page-1.jpg, page-2.jpg, ...
function main() {
  if (!existsSync(SAMPLES_DIR)) {
    console.error(`samples dir not found: ${SAMPLES_DIR}`);
    process.exit(1);
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });

  let outIdx = 1;
  const manifest: Array<{ sourcePdf: string; sourcePage: number; outFile: string }> = [];

  for (const pdfName of Object.keys(PAGE_PLAN)) {
    const srcPath = join(SAMPLES_DIR, pdfName);
    if (!existsSync(srcPath)) {
      console.warn(`[skip] ${pdfName} not in samples/`);
      continue;
    }
    for (const pageNum of PAGE_PLAN[pdfName]) {
      const outName = `page-${outIdx}`;
      const outPath = join(OUTPUT_DIR, outName);
      // pdftoppm: -jpeg, -r 144 (~ 200 dpi for ~1024w on A4), one page only
      execSync(
        `pdftoppm -jpeg -r 144 -f ${pageNum} -l ${pageNum} "${srcPath}" "${outPath}"`,
        { stdio: 'inherit' }
      );
      // pdftoppm appends -1 to the output prefix when -f == -l; rename to clean
      execSync(`mv "${outPath}-${pageNum}.jpg" "${outPath}.jpg" 2>/dev/null || mv "${outPath}-${String(pageNum).padStart(2, '0')}.jpg" "${outPath}.jpg" 2>/dev/null || true`);
      manifest.push({ sourcePdf: pdfName, sourcePage: pageNum, outFile: `${outName}.jpg` });
      outIdx++;
    }
  }

  // Write a small manifest so Test 3 can backtrack which JPEG came from which PDF page.
  const manifestPath = join(OUTPUT_DIR, 'manifest.json');
  require('node:fs').writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`wrote ${manifest.length} pages → ${OUTPUT_DIR} (manifest: ${manifestPath})`);
}

main();
