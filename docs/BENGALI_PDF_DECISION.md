# Bengali PDF: what to use in orbit-next

**Decision: PDFKit + Hind Siliguri, embedded as a subset.**
Measured, not assumed — every number below came from running the proof in
`tools/pdf-proof/`.

---

## The actual problem

Printing Bangla codepoints is easy. The hard part is **GSUB shaping**: the
OpenType tables that turn `ক + ্ + ষ` into the single conjunct glyph `ক্ষ`, and
move a vowel sign like `ি` to the left of the consonant it follows in memory.

A library without shaping still produces a PDF. It just produces one that reads
as broken Bangla — `ক্ষ` shown as three separate marks. That is why "the PDF was
generated" is not a test, and why the proof counts glyphs instead.

mPDF does this correctly in the PHP original, so the replacement has to as well.

---

## What was tested

### 1. PDFKit + fontkit — **chosen**

PDFKit hands every string to fontkit, which applies the font's GSUB/GPOS tables.

`tools/pdf-proof/shaping-test.mjs` — the shaper:

```
GSUB present  : yes        GPOS present : yes
ক্ষ  3 cp → 1 glyph (430)   জ্ঞ  3 cp → 1 glyph (431)
ত্র  3 cp → 1 glyph (632)   শ্র  3 cp → 1 glyph (642)
ক্র  3 cp → 1 glyph (617)   গ্র  3 cp → 1 glyph (619)
প্র  3 cp → 1 glyph (637)   ন্দ  3 cp → 1 glyph (544)
ন্ধ  3 cp → 1 glyph (549)   ত্ত  3 cp → 1 glyph (531)
স্থ  3 cp → 1 glyph (541)   ষ্ঠ  3 cp → 1 glyph (517)
RESULT: 12/12 conjuncts formed, reordering observed
```

`tools/pdf-proof/verify-proof.mjs` — and then on the page itself, by reading the
glyphs back out of the PDF's content stream:

```
30 passed, 0 failed
conjuncts shaped on the page: 12/12

শিক্ষা → 4 glyphs    প্রশ্ন → 2 glyphs
শ্রেণি → 4 glyphs    শিক্ষক → 4 glyphs
Orbit — অরবিট                13 glyphs, none missing
Roll 1234 / রোল ১২৩৪         21 glyphs, none missing
GPA 4.85 — জিপিএ ৪.৮৫        21 glyphs, none missing
```

The document also checks what a marksheet needs: A4 `595 × 842 pt`, exactly two
pages, header and footer on each, a six-row table with Bangla headers, justified
wrapping of a long Bangla paragraph, mixed Bangla/English lines, Bangla and Latin
numerals, an embedded `FontFile2` subset, `Type0`/`Identity-H` encoding, and a
`ToUnicode` map so a name can still be copied out of the PDF.

**Cost**, measured on Node 24:

| | |
|---|---|
| Disk | 11 MB (pdfkit) + 5.7 MB (fontkit) = **~17 MB** |
| `require()` | **80 ms** |
| One document, 40 Bangla lines | **11 ms** |
| Peak heap | **24 MB** |
| Output | **8.3 KB** |

That fits a Vercel function with room to spare and adds no cold-start worth
naming. Runtime must be `nodejs` (not edge) because the font is read from disk.

### 2. Puppeteer + @sparticuz/chromium — viable, rejected on cost

Chromium uses HarfBuzz, so its Bangla is correct by construction, and HTML/CSS
gives better layout control than PDFKit's drawing API.

It was **not run here**, deliberately: `@sparticuz/chromium` alone is
**70,091,665 bytes unpacked** (v153) plus `puppeteer-core` at 5,972,104 bytes —
roughly **4.5× PDFKit's footprint before any code**, against a Vercel function
limit of 250 MB unzipped. Published behaviour is a 1–3 s cold start and
300–500 MB of memory per invocation.

Since PDFKit passes every requirement at 11 ms and 24 MB, paying that is not
justified. It stays the documented fallback for one case: a future document whose
layout genuinely needs CSS (floats, grid, complex tables) rather than positioned
drawing.

### 3. jsPDF — **rejected, it cannot shape**

The scaffold in the abandoned `orbit-nextjs/` attempt had `jspdf` +
`jspdf-autotable` in its dependencies. jsPDF maps characters to glyphs one to
one and applies no GSUB, so every conjunct in a marksheet would break. Had that
scaffold been built on, the failure would only have surfaced when a real
marksheet was printed.

### 4. @react-pdf/renderer — rejected

319,813 bytes and a pleasant React API, but its own layout engine does not
implement Indic shaping. Same failure as jsPDF, in nicer syntax.

### 5. pdf-lib — rejected for text

19,461,112 bytes. Excellent at manipulating existing PDFs, but it draws text
without shaping; `@pdf-lib/fontkit` embeds and subsets a font, it does not lay
text out. Still worth keeping in mind for merging or stamping finished PDFs.

---

## Summary

| | Bangla shaping | Size | Cold start | Per document | Vercel | Verdict |
|---|---|---|---|---|---|---|
| **PDFKit + fontkit** | **12/12 verified** | 17 MB | 80 ms | 11 ms | yes | **chosen** |
| Puppeteer + chromium | correct (HarfBuzz) | 76 MB+ | 1–3 s | 300–800 ms | yes, heavy | fallback |
| jsPDF | none | 3 MB | fast | fast | yes | unusable |
| @react-pdf/renderer | none | 0.3 MB | fast | fast | yes | unusable |
| pdf-lib | none (no layout) | 19 MB | fast | fast | yes | post-processing only |

---

## Two traps the proof exposed

Both cost a debugging round and would have cost more inside a real marksheet:

1. **Drawing a header or footer from a `pageAdded` handler recurses.** Text that
   can wrap inside the handler overflows, PDFKit adds a page to fit it, the
   handler fires again — the stack blows. Use `bufferPages: true` and draw the
   chrome at the end over `bufferedPageRange()`.
2. **A footer below the bottom margin silently adds pages.** Crossing that margin
   reads as "page full", so a two-page document became four. Set
   `doc.page.margins.bottom = 0` around the footer, then restore it.

Both are handled in `tools/pdf-proof/pdfkit-proof.mjs` and must carry into the
Phase 13 implementation.

A third trap belongs to the *verification*, not the renderer: a PDF's `ToUnicode`
CMap is itself a deflate stream full of `<hex>` pairs. Counting those alongside
the page content doubles every glyph count and invents a `<0000>`, which looks
exactly like a shaping failure. Only glyphs inside `BT…ET` text-showing
operators may be counted.

---

## What Phase 13 should use

```jsonc
// dependencies
"pdfkit": "^0.20.2"     // pulls fontkit, linebreak, png-js
```

```ts
// app/api/**/pdf/route.ts
export const runtime = 'nodejs';       // not edge: the font is read from disk
export const dynamic = 'force-dynamic';
```

- Fonts live in `assets/fonts/hind-siliguri/` (copied from the original, which was
  not modified). Register `HindSiliguri-Regular.ttf` and `-Bold.ttf`; PDFKit
  subsets automatically, which is why the proof is 8.3 KB and not 250 KB.
- Build documents with `bufferPages: true`, draw page chrome last.
- Shared helpers belong in `lib/pdf/` — page setup, header/footer, the table
  drawer from the proof — so marksheet, ID card and fee slip do not each
  reimplement them.
- Keep `tools/pdf-proof/verify-proof.mjs` in the repository and run it in CI. It
  is the regression test that catches a font swap or a library upgrade quietly
  breaking conjuncts.

## Limitations to accept

- **Layout is drawing, not CSS.** Columns and tables are positioned by hand, as in
  the proof. This suits marksheets and ID cards; it is tedious for anything
  free-flowing.
- **Bidirectional text is not handled.** Irrelevant for Bangla and English.
- **The font must be in the deployment bundle.** It is, under `assets/`, and must
  not be moved to a CDN — a network fetch inside PDF generation would add
  latency and a failure mode.
- **Node runtime only.** These routes cannot run on the edge.
