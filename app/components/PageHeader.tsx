/**
 * The one page-header grammar: optional mono kicker → serif title →
 * optional one-line italic caption. Left-aligned, identical on every page.
 * The wordmark lives in the rail — never repeat it as a page title.
 */
export function PageHeader({
  kicker,
  title,
  caption,
}: {
  kicker?: string;
  title: string;
  caption?: string;
}) {
  return (
    <header className="mb-8">
      {kicker && (
        <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted mb-1">
          {kicker}
        </div>
      )}
      <h1 className="font-serif text-[28px] font-semibold leading-tight mb-1">{title}</h1>
      {caption && (
        <p className="font-serif italic text-[14px] text-muted">{caption}</p>
      )}
    </header>
  );
}
