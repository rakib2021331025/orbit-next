/**
 * A search box that is a plain GET form.
 *
 * No JavaScript: submitting puts the query in the URL, so a search can be
 * shared, bookmarked and paginated, and the back button behaves. `hidden`
 * carries the filters already in the URL — without it, searching would silently
 * drop the branch filter the visitor arrived with.
 */
export function SearchBox({
  action,
  name,
  defaultValue,
  label,
  placeholder,
  hidden,
}: {
  action: string;
  name: string;
  defaultValue?: string;
  label: string;
  placeholder?: string;
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <form action={action} method="get" role="search" className="flex w-full max-w-sm gap-2">
      {Object.entries(hidden ?? {}).map(([key, value]) =>
        value ? <input key={key} type="hidden" name={key} value={value} /> : null
      )}

      <label className="sr-only" htmlFor={`search-${name}`}>
        {label}
      </label>
      <input
        id={`search-${name}`}
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder ?? label}
        className="w-full rounded-orbit border border-line bg-surface px-4 py-2 text-sm text-ink shadow-sm outline-none transition placeholder:text-ink-muted/60 focus:border-primary focus:ring-2 focus:ring-primary/25"
      />
      <button
        type="submit"
        className="shrink-0 rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
      >
        <i className="bi bi-search" aria-hidden />
        <span className="sr-only">{label}</span>
      </button>
    </form>
  );
}
