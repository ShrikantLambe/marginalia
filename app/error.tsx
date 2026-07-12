"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-xl px-8 py-24 text-center">
      <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted mb-4">
        Something went wrong
      </div>
      <h1 className="font-serif text-[28px] font-semibold mb-3">
        A page failed to load
      </h1>
      <p className="font-serif italic text-[15px] text-muted mb-8">
        The error has been logged. You can retry, or head back to your reading.
      </p>
      <div className="flex items-center justify-center gap-4 font-mono text-[10px] tracking-[0.15em] uppercase">
        <button
          onClick={reset}
          className="border border-oxblood text-oxblood px-3 py-2 hover:bg-oxblood hover:text-paper transition-colors"
        >
          Try again
        </button>
        <Link href="/home" className="text-muted hover:text-ink transition-colors">
          Front page →
        </Link>
      </div>
    </main>
  );
}
