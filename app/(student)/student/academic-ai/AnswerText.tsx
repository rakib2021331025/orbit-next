'use client';

import { Fragment } from 'react';

/**
 * Renders an answer: paragraphs, lists, fenced code, and LaTeX maths.
 *
 * **Everything is escaped by construction.** The answer comes from a language
 * model and is rendered as React children — never through
 * `dangerouslySetInnerHTML` — so a model that emits `<script>` produces the text
 * `<script>`, which is what the original's "escape first, then format" rule
 * achieves in PHP.
 *
 * Maths is shown in a styled span rather than typeset. KaTeX would render it
 * properly but costs ~280 KB plus a font; this keeps the notation legible and
 * distinct, and the decision to add KaTeX can be made later without changing
 * anything that calls this.
 */
export function AnswerText({ content }: { content: string }) {
  const blocks = splitBlocks(content);

  return (
    <div className="space-y-2.5 leading-relaxed">
      {blocks.map((block, index) => {
        if (block.kind === 'code') {
          return (
            <pre
              key={index}
              className="overflow-x-auto rounded-orbit bg-brand-deep p-3 text-xs text-white/90"
            >
              <code>{block.text}</code>
            </pre>
          );
        }

        if (block.kind === 'display-math') {
          return (
            <p
              key={index}
              className="overflow-x-auto rounded-orbit bg-surface-2 px-3 py-2 text-center font-mono text-sm text-ink"
            >
              {block.text}
            </p>
          );
        }

        if (block.kind === 'list') {
          return (
            <ul key={index} className="ms-4 list-disc space-y-1">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Inline text={item} />
                </li>
              ))}
            </ul>
          );
        }

        if (block.kind === 'heading') {
          return (
            <p key={index} className="font-head font-semibold text-ink-heading">
              <Inline text={block.text} />
            </p>
          );
        }

        return (
          <p key={index} className="whitespace-pre-wrap">
            <Inline text={block.text} />
          </p>
        );
      })}
    </div>
  );
}

/** Inline `$…$` maths and `**bold**`, as React children. */
function Inline({ text }: { text: string }) {
  // Split on inline maths first: bold inside maths is notation, not emphasis.
  const parts = text.split(/(\$[^$\n]+\$)/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
          return (
            <span key={index} className="rounded bg-surface-3 px-1 font-mono text-[0.95em]">
              {part.slice(1, -1)}
            </span>
          );
        }

        const bold = part.split(/(\*\*[^*]+\*\*)/g);
        return (
          <Fragment key={index}>
            {bold.map((piece, pieceIndex) =>
              piece.startsWith('**') && piece.endsWith('**') && piece.length > 4 ? (
                <strong key={pieceIndex}>{piece.slice(2, -2)}</strong>
              ) : (
                <Fragment key={pieceIndex}>{piece}</Fragment>
              )
            )}
          </Fragment>
        );
      })}
    </>
  );
}

type Block =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'display-math'; text: string }
  | { kind: 'list'; items: string[] };

/**
 * Splits an answer into blocks.
 *
 * Fenced code is taken out FIRST, so `$` or `#` inside a code sample is not
 * mistaken for maths or a heading.
 */
function splitBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const fences = content.split(/```/);

  fences.forEach((chunk, index) => {
    // Odd indices are inside a fence.
    if (index % 2 === 1) {
      // Drop the language tag on the opening line.
      const body = chunk.replace(/^[a-zA-Z0-9+#-]*\n/, '');
      blocks.push({ kind: 'code', text: body.replace(/\n$/, '') });
      return;
    }

    // Outside a fence: split on display maths, then on paragraphs.
    const pieces = chunk.split(/\$\$/g);

    pieces.forEach((piece, pieceIndex) => {
      // Odd indices are between a pair of $$ delimiters.
      if (pieceIndex % 2 === 1) {
        const math = piece.trim();
        if (math !== '') blocks.push({ kind: 'display-math', text: math });
        return;
      }

      for (const paragraph of piece.split(/\n{2,}/)) {
        const text = paragraph.trim();
        if (text === '') continue;

        const lines = text.split('\n');
        const bullets = lines.filter((line) => /^\s*([-*•]|\d+[.)])\s+/.test(line));

        // A block is a list when most of its lines are bullets — a single
        // hyphenated line inside a paragraph is not.
        if (bullets.length >= 2 && bullets.length >= lines.length - 1) {
          blocks.push({
            kind: 'list',
            items: bullets.map((line) => line.replace(/^\s*([-*•]|\d+[.)])\s+/, '')),
          });
          continue;
        }

        if (/^#{1,6}\s+/.test(text)) {
          blocks.push({ kind: 'heading', text: text.replace(/^#{1,6}\s+/, '') });
          continue;
        }

        blocks.push({ kind: 'paragraph', text });
      }
    });
  });

  return blocks;
}
