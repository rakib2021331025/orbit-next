'use client';

import { useState } from 'react';

/**
 * Copies a value to the clipboard — the `data-orbit-copy` buttons of the PHP
 * portal, used for bKash / Nagad numbers a parent is about to type into an app.
 */
export function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          // No clipboard (an old browser or an insecure origin): the number is on screen anyway.
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-orbit border border-primary px-2.5 py-1 text-sm font-medium text-primary transition hover:bg-primary-soft"
    >
      <i className={`bi ${copied ? 'bi-check2' : 'bi-clipboard'}`} aria-hidden />
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}
