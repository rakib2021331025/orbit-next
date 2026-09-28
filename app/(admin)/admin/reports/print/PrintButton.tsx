'use client';

/** The print button on the sheet — the one control the page needs a browser for. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="rp-btn rp-btn-primary" onClick={() => window.print()}>
      {label}
    </button>
  );
}
