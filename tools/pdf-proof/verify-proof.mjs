/**
 * Checks that the proof PDF really contains SHAPED Bangla.
 *
 * "A PDF was produced" proves nothing — a library with no GSUB support also
 * produces a PDF, with every conjunct broken into its parts. So each conjunct
 * is written into a PDF of its own and the glyphs in that page's content
 * stream are counted: ক + ্ + ষ is three codepoints, and one glyph coming out
 * means the conjunct was formed on the page, not merely in the shaper.
 *
 * The ids inside a PDF are SUBSET ids (0001, 0002, …) because PDFKit embeds
 * only the glyphs used, so they cannot be compared with fontkit's ids. The
 * count is what carries the meaning.
 *
 * Run: node tools/pdf-proof/verify-proof.mjs
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const here = path.dirname(fileURLToPath(import.meta.url));
const pdfPath = path.join(here, 'out/pdfkit-proof.pdf');
const fontPath = path.join(here, '../../assets/fonts/hind-siliguri/HindSiliguri-Regular.ttf');

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(50)} ${detail}`);
};

/** Every decompressed content stream of a PDF buffer, joined. */
function contentOf(buffer) {
  const raw = buffer.toString('latin1');
  const out = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    try {
      out.push(zlib.inflateSync(buffer.subarray(start, end)).toString('latin1'));
    } catch {
      /* not a deflate stream (font file, image) — skip */
    }
  }
  return out.join('\n');
}

/**
 * The glyph ids actually drawn on the page.
 *
 * Only text-showing operators count. A PDF's ToUnicode CMap is also a deflate
 * stream full of <hex> pairs (bfchar/bfrange), and counting those doubled
 * every result and added a phantom <0000> — which looked exactly like a
 * shaping failure until the streams were read side by side.
 */
function glyphsIn(content) {
  const ids = [];
  // Inside BT…ET only, and only the runs handed to TJ or Tj.
  for (const block of content.matchAll(/BT([\s\S]*?)ET/g)) {
    const body = block[1];
    for (const show of body.matchAll(/((?:<[0-9A-Fa-f]*>|\s|-?[\d.]+)+)\]?\s*(?:TJ|Tj)/g)) {
      for (const run of show[1].matchAll(/<([0-9A-Fa-f]+)>/g)) {
        const hex = run[1];
        for (let i = 0; i + 4 <= hex.length; i += 4) {
          ids.push(parseInt(hex.slice(i, i + 4), 16));
        }
      }
    }
  }
  return ids;
}

/** A one-line PDF containing exactly `text`, returned as a buffer. */
function renderOne(text) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.registerFont('bn', fontPath);
    doc.font('bn').fontSize(20).text(text, 40, 40, { lineBreak: false });
    doc.end();
  });
}

/* ------------------------------------------------------- the proof file */
console.log('\nTHE PROOF DOCUMENT');
if (!fs.existsSync(pdfPath)) {
  console.error('  run pdfkit-proof.mjs first');
  process.exit(1);
}
const pdf = fs.readFileSync(pdfPath);
const raw = pdf.toString('latin1');

check('is a PDF', raw.startsWith('%PDF-'), raw.slice(0, 8).trim());
check('ends with %%EOF', pdf.subarray(-1024).toString('latin1').includes('%%EOF'));
check('is A4 (595 x 842 pt)', /MediaBox\s*\[\s*0\s+0\s+595[.\d]*\s+841[.\d]*/.test(raw));
const pageCount = Number((raw.match(/\/Count\s+(\d+)/) || [])[1] || 0);
check('has exactly 2 pages', pageCount === 2, `${pageCount} found`);
check('embeds Hind Siliguri', /HindSiliguri/.test(raw));
check('embeds the font file (FontFile2)', /FontFile2/.test(raw));
check('uses a Type0 composite font', /\/Subtype\s*\/Type0/.test(raw));
check('uses Identity-H encoding', /Identity-H/.test(raw));
check('has a ToUnicode map (text stays selectable)', /ToUnicode/.test(raw));

const proofContent = contentOf(pdf);
check('content streams are readable', proofContent.length > 500, `${proofContent.length} chars`);
check('the page draws glyphs', glyphsIn(proofContent).length > 200,
  `${glyphsIn(proofContent).length} glyph draws`);

/* --------------------------------------------- shaping, measured per glyph */
console.log('\nCONJUNCTS — codepoints in, glyphs written to the page');
const conjuncts = ['ক্ষ', 'জ্ঞ', 'ত্র', 'শ্র', 'ক্র', 'গ্র', 'প্র', 'ন্দ', 'ন্ধ', 'ত্ত', 'স্থ', 'ষ্ঠ'];
let shaped = 0;
for (const text of conjuncts) {
  const buf = await renderOne(text);
  const ids = glyphsIn(contentOf(buf));
  const cp = [...text].length;
  const ok = ids.length < cp;
  if (ok) shaped++;
  check(`${text}  ${cp} cp → ${ids.length} glyph${ids.length === 1 ? '' : 's'}`, ok,
    ok ? 'conjunct formed' : 'NOT shaped — parts drawn separately');
}

/* ------------------------------------------------ vowel signs and clusters */
console.log('\nVOWEL SIGNS AND WORDS');
for (const [text, expect] of [
  ['শিক্ষা', 4],
  ['প্রশ্ন', 2],
  ['শ্রেণি', 4],
  ['শিক্ষক', 4],
]) {
  const ids = glyphsIn(contentOf(await renderOne(text)));
  check(`${text}  → ${ids.length} glyphs`, ids.length === expect, `expected ${expect}`);
}

/* --------------------------------------------------------- mixed and digits */
console.log('\nMIXED SCRIPT AND NUMERALS');
for (const text of ['Orbit — অরবিট', 'Roll 1234 / রোল ১২৩৪', 'GPA 4.85 — জিপিএ ৪.৮৫']) {
  const ids = glyphsIn(contentOf(await renderOne(text)));
  const missing = ids.filter((id) => id === 0).length;
  check(`${text}`, ids.length > 0 && missing === 0,
    missing ? `${missing} missing glyph(s)` : `${ids.length} glyphs, none missing`);
}

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`conjuncts shaped on the page: ${shaped}/${conjuncts.length}`);
process.exit(fail === 0 && shaped === conjuncts.length ? 0 : 1);
