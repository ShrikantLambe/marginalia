import Link from "next/link";

export type Citation = { id: string; title: string | null };

/**
 * Renders answer prose with inline [n] citations turned into superscript links
 * to the source item. Shared by "Ask your library", brief answers, and the
 * synthesis view. Plain text in, links out — no markdown dependency.
 * An [n] with no matching source is left as literal text.
 */
export function CitedText({
  text,
  sources,
  className,
}: {
  text: string;
  sources: Citation[];
  className?: string;
}) {
  // Split on [1], [12], … keeping the delimiters
  const parts = text.split(/(\[\d+\])/g);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (m) {
          const n = Number(m[1]);
          const source = sources[n - 1];
          if (source) {
            return (
              <Link
                key={i}
                href={`/items/${source.id}`}
                title={source.title ?? undefined}
                className="text-oxblood align-super text-[0.7em] font-mono hover:underline"
              >
                [{n}]
              </Link>
            );
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
