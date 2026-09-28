'use client';

/** A button that opens the browser's print dialog — the one thing a print sheet needs a browser for. */
export function PrintButton({ label, className }: { label: string; className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      <i className="bi bi-printer me-1.5" aria-hidden />
      {label}
    </button>
  );
}
