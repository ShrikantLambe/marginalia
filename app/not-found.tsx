import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-8 py-24 text-center">
      <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted mb-4">
        404
      </div>
      <h1 className="font-serif text-[28px] font-semibold mb-3">
        This page isn&apos;t on the shelf
      </h1>
      <p className="font-serif italic text-[15px] text-muted mb-8">
        The link may be old, or the item was removed.
      </p>
      <Link
        href="/home"
        className="font-mono text-[10px] tracking-[0.15em] uppercase border border-oxblood text-oxblood px-3 py-2 hover:bg-oxblood hover:text-paper transition-colors"
      >
        Front page →
      </Link>
    </main>
  );
}
