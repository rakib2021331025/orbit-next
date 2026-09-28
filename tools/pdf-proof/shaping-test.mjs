/**
 * Does the candidate actually SHAPE Bangla?
 *
 * Printing Bangla codepoints is easy; the hard part is GSUB — the OpenType
 * table that turns ক + ্ + ষ into the single conjunct glyph ক্ষ, and moves
 * vowel signs to the correct side of the consonant. A library that skips GSUB
 * produces text that is readable-ish to a machine and wrong to a reader.
 *
 * fontkit's layout() reports the glyph run it would produce. Fewer glyphs than
 * codepoints, with the middle hasanta consumed, means the conjunct was formed.
 * That is a measurement, not an opinion, so it settles the question without
 * anyone having to eyeball a PDF.
 *
 * Run: node tools/pdf-proof/shaping-test.mjs
 */
import * as fontkit from 'fontkit';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const fontPath = path.join(here, '../../assets/fonts/hind-siliguri/HindSiliguri-Regular.ttf');

const font = fontkit.openSync(fontPath);

console.log('font          :', font.familyName, '—', font.postscriptName);
console.log('GSUB present  :', font.GSUB ? 'yes' : 'NO');
console.log('GPOS present  :', font.GPOS ? 'yes' : 'NO');
console.log('glyphs        :', font.numGlyphs);
console.log('');

/** The conjuncts the brief asks about. */
const conjuncts = ['ক্ষ', 'জ্ঞ', 'ত্র', 'শ্র', 'ক্র', 'গ্র', 'প্র', 'ন্দ', 'ন্ধ', 'ত্ত', 'স্থ', 'ষ্ঠ'];

/** Words and phrases from the brief. */
const phrases = [
  'অরবিট প্রাইভেট কেয়ার',
  'শিক্ষার্থীর নাম',
  'অভিভাবকের নাম',
  'উপস্থিতির প্রতিবেদন',
  'পরীক্ষার ফলাফল',
  'বাংলা যুক্তাক্ষর পরীক্ষা',
  'শিক্ষা',
  'প্রশ্ন',
  'শ্রেণি',
  'শিক্ষক',
];

let conjunctsFormed = 0;

console.log('CONJUNCTS — codepoints in, glyphs out (fewer = the conjunct was formed)');
console.log('  text   cp  glyphs  formed  glyph ids');
for (const text of conjuncts) {
  const run = font.layout(text);
  const cp = [...text].length;
  const glyphs = run.glyphs.length;
  // ক + ্ + ষ is 3 codepoints; a formed conjunct is 1 glyph (sometimes 2 when
  // the font keeps a reph or post-base form separate, which is still shaping).
  const formed = glyphs < cp;
  if (formed) conjunctsFormed++;
  console.log(
    `  ${text.padEnd(6)} ${String(cp).padStart(2)}  ${String(glyphs).padStart(6)}  ${(formed ? 'yes' : 'NO').padStart(6)}  ` +
      run.glyphs.map((g) => g.id).join(',')
  );
}

console.log('');
console.log('PHRASES — shaped glyph count vs codepoints');
let anyReorder = false;
for (const text of phrases) {
  const run = font.layout(text);
  const cp = [...text].length;
  // A vowel sign that moves before its consonant (ি, ে, ৈ, ো, ৌ) shows up as a
  // glyph whose cluster index runs backwards — evidence of reordering.
  const clusters = run.glyphs.map((g) => g.codePoints?.[0] ?? 0);
  const reordered = run.glyphs.some((g, i) => i > 0 && (g.codePoints?.[0] ?? 0) < clusters[i - 1] - 2000);
  if (reordered) anyReorder = true;
  console.log(
    `  ${String(cp).padStart(3)} cp → ${String(run.glyphs.length).padStart(3)} glyphs  ${reordered ? '(reordered)' : ''}  ${text}`
  );
}

console.log('');
console.log('MIXED AND NUMBERS');
for (const text of ['Orbit Private Care — অরবিট প্রাইভেট কেয়ার', 'Roll 1234 / রোল ১২৩৪', 'GPA 4.85 — জিপিএ ৪.৮৫']) {
  const run = font.layout(text);
  console.log(`  ${String([...text].length).padStart(3)} cp → ${String(run.glyphs.length).padStart(3)} glyphs  ${text}`);
  const missing = run.glyphs.filter((g) => g.id === 0).length;
  if (missing) console.log(`     !! ${missing} glyph(s) missing from the font`);
}

console.log('');
console.log(`RESULT: ${conjunctsFormed}/${conjuncts.length} conjuncts formed, reordering ${anyReorder ? 'observed' : 'not observed'}`);
process.exit(conjunctsFormed === conjuncts.length ? 0 : 1);
