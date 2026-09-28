/**
 * Bengali PDF proof — PDFKit + Hind Siliguri.
 *
 * Produces one A4 document exercising everything a marksheet, ID card or fee
 * slip needs: header and footer on every page, a table, Bangla/English mixed
 * lines, Bangla and Latin numerals, long-line wrapping, and a second page.
 *
 * PDFKit hands text to fontkit, which applies the font's GSUB/GPOS tables, so
 * conjuncts are formed and vowel signs reordered the same way mPDF does it in
 * the PHP original. shaping-test.mjs measures that separately;
 * verify-proof.mjs checks it survived into this file.
 *
 * Run: node tools/pdf-proof/pdfkit-proof.mjs
 */
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.join(here, '../../assets/fonts/hind-siliguri');
const out = path.join(here, 'out');
fs.mkdirSync(out, { recursive: true });

const REGULAR = path.join(fontDir, 'HindSiliguri-Regular.ttf');
const BOLD = path.join(fontDir, 'HindSiliguri-Bold.ttf');

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 64, bottom: 64, left: 48, right: 48 },
  info: {
    Title: 'Orbit Private Care — Bengali PDF proof',
    Author: 'Orbit Private Care',
  },
  bufferPages: true,   // header/footer are drawn at the end, see decorateAll()
});

doc.registerFont('bn', REGULAR);
doc.registerFont('bn-bold', BOLD);

const GREEN = '#15803d';
const DEEP = '#062c19';
const MUTED = '#5b6961';
const LINE = '#d7e0d9';

const pageWidth = doc.page ? doc.page.width : 595.28;

/**
 * Header and footer for every page.
 *
 * Drawn at the END, over buffered pages, not from a 'pageAdded' handler.
 * Drawing inside that handler is the documented trap: a text call there can
 * overflow, PDFKit adds a page to fit it, the handler fires again, and the
 * document recurses until the stack blows.
 */
function decorateAll() {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const { width, height } = doc.page;
    const left = 48;
    const right = width - 48;

    doc.save();
    doc.font('bn-bold').fontSize(15).fillColor(DEEP)
      .text('অরবিট প্রাইভেট কেয়ার', left, 26, { width: right - left, lineBreak: false });
    doc.font('bn').fontSize(9).fillColor(MUTED)
      .text('Orbit Private Care — Rangpur', left, 45, { width: right - left, lineBreak: false });
    doc.moveTo(left, 60).lineTo(right, 60).strokeColor(LINE).lineWidth(1).stroke();

    // The footer sits below the bottom margin. PDFKit treats crossing that
    // margin as "the page is full" and adds another page — which is how a
    // two-page document quietly became four. Dropping the margin while the
    // footer is drawn, then putting it back, keeps the page count honest.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('bn').fontSize(8).fillColor(MUTED)
      .text(`উপস্থিতির প্রতিবেদন · পৃষ্ঠা ${i - range.start + 1} / ${range.count}`,
        left, height - 44, { width: right - left, lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
    doc.restore();
  }
}

let y = 84;

doc.font('bn-bold').fontSize(18).fillColor(DEEP).text('পরীক্ষার ফলাফল', 48, y);
y = doc.y + 4;
doc.font('bn').fontSize(10).fillColor(MUTED)
  .text('বাংলা যুক্তাক্ষর পরীক্ষা — Bengali conjunct rendering test', 48, y);
y = doc.y + 16;

/* ------------------------------------------------------------- conjuncts */
doc.font('bn-bold').fontSize(12).fillColor(DEEP).text('যুক্তাক্ষর', 48, y);
y = doc.y + 6;
doc.font('bn').fontSize(16).fillColor('#1d2a22')
  .text('ক্ষ   জ্ঞ   ত্র   শ্র   ক্র   গ্র   প্র   ন্দ   ন্ধ   ত্ত   স্থ   ষ্ঠ', 48, y);
y = doc.y + 6;
doc.fontSize(14)
  .text('শিক্ষা   প্রশ্ন   শ্রেণি   শিক্ষক   শিক্ষার্থীর নাম   অভিভাবকের নাম', 48, y);
y = doc.y + 18;

/* ----------------------------------------------------------- the wrapping */
doc.font('bn-bold').fontSize(12).fillColor(DEEP).text('লাইন র‍্যাপিং', 48, y);
y = doc.y + 6;
doc.font('bn').fontSize(10).fillColor('#1d2a22').text(
  'অরবিট প্রাইভেট কেয়ার রংপুরের একটি কোচিং প্রতিষ্ঠান। এখানে শিক্ষার্থীরা নিয়মিত ক্লাস, পরীক্ষা, ' +
    'ফলাফল এবং পড়াশোনার উপকরণ একই জায়গায় পায়। এই অনুচ্ছেদটি যথেষ্ট দীর্ঘ যাতে বোঝা যায় লাইন ' +
    'র‍্যাপিং ঠিকমতো কাজ করছে কিনা এবং যুক্তাক্ষরসহ শব্দ ভাঙার সময় কোনো সমস্যা হচ্ছে কিনা।',
  48,
  y,
  { width: pageWidth - 96, align: 'justify', lineGap: 2 }
);
y = doc.y + 18;

/* ----------------------------------------------------------------- table */
doc.font('bn-bold').fontSize(12).fillColor(DEEP).text('বিষয়ভিত্তিক নম্বর', 48, y);
y = doc.y + 8;

const cols = [
  { key: 'subject', label: 'বিষয়', width: 180, align: 'left' },
  { key: 'marks', label: 'নম্বর', width: 80, align: 'right' },
  { key: 'grade', label: 'গ্রেড', width: 70, align: 'center' },
  { key: 'gpa', label: 'জিপিএ', width: 70, align: 'right' },
  { key: 'note', label: 'মন্তব্য', width: 99, align: 'left' },
];
const rows = [
  { subject: 'বাংলা', marks: '৮৫', grade: 'A+', gpa: '৫.০০', note: 'চমৎকার' },
  { subject: 'ইংরেজি / English', marks: '৭৮', grade: 'A', gpa: '৪.০০', note: 'ভালো' },
  { subject: 'গণিত', marks: '৯২', grade: 'A+', gpa: '৫.০০', note: 'অসাধারণ' },
  { subject: 'পদার্থবিজ্ঞান', marks: '৭১', grade: 'A-', gpa: '৩.৫০', note: 'উন্নতি প্রয়োজন' },
  { subject: 'রসায়ন', marks: '৬৬', grade: 'A-', gpa: '৩.৫০', note: 'মনোযোগ দিতে হবে' },
  { subject: 'তথ্য ও যোগাযোগ প্রযুক্তি', marks: '৮৮', grade: 'A+', gpa: '৫.০০', note: 'ভালো' },
];

function tableRow(values, { bold = false, fill = null } = {}) {
  const height = 22;
  let x = 48;
  if (fill) {
    doc.save().rect(48, y, pageWidth - 96, height).fillColor(fill).fill().restore();
  }
  doc.font(bold ? 'bn-bold' : 'bn').fontSize(10).fillColor(bold ? DEEP : '#1d2a22');
  for (const col of cols) {
    doc.text(String(values[col.key] ?? ''), x + 6, y + 6, {
      width: col.width - 12,
      align: col.align,
      lineBreak: false,
    });
    x += col.width;
  }
  doc.moveTo(48, y + height).lineTo(pageWidth - 48, y + height)
    .strokeColor(LINE).lineWidth(0.5).stroke();
  y += height;
}

tableRow(Object.fromEntries(cols.map((c) => [c.key, c.label])), { bold: true, fill: '#e7f4ec' });
for (const row of rows) tableRow(row);

y += 10;
doc.font('bn-bold').fontSize(11).fillColor(GREEN)
  .text('সর্বমোট জিপিএ: ৪.৩৩  (GPA 4.33)', 48, y);
y = doc.y + 20;

/* ------------------------------------------------------------ mixed lines */
doc.font('bn-bold').fontSize(12).fillColor(DEEP).text('মিশ্র লেখা ও সংখ্যা', 48, y);
y = doc.y + 6;
doc.font('bn').fontSize(10).fillColor('#1d2a22');
for (const line of [
  'শিক্ষার্থীর নাম: Md Rakib Hasan — মোঃ রাকিব হাসান',
  'রোল / Roll: ORBIT-2026-0001',
  'শ্রেণি: HSC 2027 Science — এইচএসসি ২০২৭ বিজ্ঞান',
  'উপস্থিতি: ৮৫% (85%)   ফি: ৳ ১,২৫০.০০',
  'তারিখ / Date: ২২ সেপ্টেম্বর ২০২৬ — 22 September 2026',
]) {
  doc.text(line, 48, y, { width: pageWidth - 96 });
  y = doc.y + 3;
}

/* --------------------------------------------------------- a second page */
doc.addPage();
doc.font('bn-bold').fontSize(14).fillColor(DEEP).text('দ্বিতীয় পৃষ্ঠা — multiple pages', 48, 84);
doc.font('bn').fontSize(10).fillColor('#1d2a22').text(
  'এই পৃষ্ঠাটি প্রমাণ করে যে একাধিক পৃষ্ঠায় হেডার ও ফুটার ঠিকভাবে বসছে এবং যুক্তাক্ষর ' +
    '(ক্ষ, জ্ঞ, ত্র, স্থ, ষ্ঠ) প্রতিটি পৃষ্ঠাতেই সঠিক আকারে থাকছে।',
  48,
  doc.y + 8,
  { width: pageWidth - 96, lineGap: 2 }
);

decorateAll();
doc.flushPages();

const file = path.join(out, 'pdfkit-proof.pdf');
const stream = fs.createWriteStream(file);
doc.pipe(stream);
doc.end();

stream.on('finish', () => {
  const size = fs.statSync(file).size;
  console.log(`wrote ${file}`);
  console.log(`  ${(size / 1024).toFixed(1)} KB, 2 pages, A4`);
});
