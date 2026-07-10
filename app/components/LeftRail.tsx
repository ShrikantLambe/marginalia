"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@stackframe/stack";
import { Search, Archive, PenTool, Plus, Inbox, ChevronDown, ChevronRight, Compass, Globe, Bookmark } from "lucide-react";
import { QuickSaveModal } from "@/app/components/QuickSaveModal";
import type { Brief } from "@/lib/supabase";

export function LeftRail() {
  const pathname = usePathname();

  const [modalOpen, setModalOpen] = useState(false);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [briefsOpen, setBriefsOpen] = useState(true);

  // Refresh on navigation so a just-created brief appears immediately
  useEffect(() => {
    fetch("/api/briefs?status=open")
      .then(r => r.ok ? r.json() : [])
      .then(data => setBriefs(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [pathname]);

  const isInbox = pathname === "/dashboard";

  const LIBRARY = [
    { href: "/search",    icon: Search,   label: "Search"   },
    { href: "/discover",  icon: Compass,  label: "Discover" },
    { href: "/sources",   icon: Globe,    label: "Sources"  },
    { href: "/tags",      icon: Archive,  label: "Index"    },
    { href: "/synthesis", icon: PenTool,  label: "Drafts"   },
  ];

  function isLibraryActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  const visibleBriefs = briefs.slice(0, 7);

  return (
    <>
      {/* ── Desktop rail (220px) ──────────────────────────────────────────── */}
      <nav className="hidden md:flex fixed left-0 top-0 h-screen w-[220px] flex-col border-r border-rule bg-paper z-40 overflow-y-auto">

        {/* Wordmark + quick-add */}
        <div className="flex items-center justify-between px-4 h-14 flex-shrink-0">
          <Link href="/dashboard" className="font-serif text-base font-semibold">
            Marg<span className="text-oxblood">i</span>nalia
          </Link>
          <button
            onClick={() => setModalOpen(true)}
            title="Add URL"
            className="flex items-center justify-center w-7 h-7 border border-oxblood text-oxblood hover:bg-oxblood hover:text-paper transition-colors flex-shrink-0"
          >
            <Plus size={13} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 flex flex-col px-3 pb-4 space-y-1">
          {/* Inbox */}
          <Link
            href="/dashboard"
            aria-current={isInbox ? "page" : undefined}
            className={`flex items-center justify-between px-2 py-1.5 rounded-sm transition-colors group ${isInbox ? "text-ink" : "text-muted hover:text-ink"}`}
          >
            <div className="flex items-center gap-2">
              {isInbox && <span className="absolute left-0 w-[3px] h-5 bg-oxblood rounded-r" style={{ marginLeft: 0 }} />}
              <Inbox size={14} strokeWidth={2} className={isInbox ? "text-oxblood" : ""} />
              <span className="font-mono text-[11px] tracking-[0.1em] uppercase">Inbox</span>
            </div>
          </Link>

          {/* Briefs — the one place reading intent lives */}
          <div className="pt-3">
            <div className="flex items-center justify-between px-2 mb-1">
              <button
                onClick={() => setBriefsOpen(v => !v)}
                className="flex items-center gap-1 font-mono text-[9px] tracking-[0.15em] uppercase text-muted hover:text-ink transition-colors"
              >
                {briefsOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                Briefs
              </button>
              <Link
                href="/briefs"
                className="text-muted hover:text-oxblood transition-colors"
                title="New brief"
              >
                <Plus size={11} strokeWidth={2.5} />
              </Link>
            </div>

            {briefsOpen && (
              <div className="space-y-0.5">
                {visibleBriefs.map(b => {
                  const active = pathname === `/briefs/${b.id}`;
                  return (
                    <Link
                      key={b.id}
                      href={`/briefs/${b.id}`}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex items-center px-2 py-1.5 rounded-sm transition-colors ${active ? "text-ink" : "text-muted hover:text-ink"}`}
                    >
                      {active && <span className="absolute left-[-12px] w-[3px] h-5 bg-oxblood rounded-r" />}
                      <span className="font-serif italic text-[13px] truncate">{b.question}</span>
                    </Link>
                  );
                })}

                {briefs.length > 7 && (
                  <Link href="/briefs" className="block px-2 py-1 font-mono text-[9px] tracking-[0.12em] uppercase text-muted hover:text-ink transition-colors">
                    All briefs →
                  </Link>
                )}

                {briefs.length === 0 && (
                  <Link href="/briefs" className="block px-2 py-1 font-serif italic text-[12px] text-muted/60 hover:text-ink transition-colors">
                    No open briefs — what are you reading toward?
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Library section */}
          <div className="pt-4">
            <div className="px-2 mb-1">
              <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-muted">Library</span>
            </div>
            <div className="space-y-0.5">
              {LIBRARY.map(({ href, icon: Icon, label }) => {
                const active = isLibraryActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center gap-2 px-2 py-1.5 rounded-sm transition-colors ${active ? "text-ink" : "text-muted hover:text-ink"}`}
                  >
                    {active && <span className="absolute left-[-12px] w-[3px] h-5 bg-oxblood rounded-r" />}
                    <Icon size={14} strokeWidth={2} className={active ? "text-oxblood" : ""} />
                    <span className="font-mono text-[11px] tracking-[0.1em] uppercase">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* User */}
        <div className="flex items-center px-4 h-14 border-t border-rule flex-shrink-0">
          <UserButton />
        </div>
      </nav>

      {/* ── Mobile bottom tab bar ─────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 flex items-center justify-around border-t border-rule bg-paper z-40">
        <button onClick={() => setModalOpen(true)} className="flex flex-col items-center gap-0.5 px-3">
          <Plus size={20} strokeWidth={2} className="text-oxblood" />
          <span className="font-mono text-[8px] tracking-[0.12em] uppercase text-oxblood">Add</span>
        </button>
        <Link href="/dashboard" className="flex flex-col items-center gap-0.5 px-3">
          <Inbox size={20} strokeWidth={2} className={isInbox ? "text-oxblood" : "text-muted"} />
          <span className={`font-mono text-[8px] tracking-[0.12em] uppercase ${isInbox ? "text-oxblood" : "text-muted"}`}>Inbox</span>
        </Link>
        <Link href="/search" className="flex flex-col items-center gap-0.5 px-3">
          <Search size={20} strokeWidth={2} className={pathname === "/search" ? "text-oxblood" : "text-muted"} />
          <span className={`font-mono text-[8px] tracking-[0.12em] uppercase ${pathname === "/search" ? "text-oxblood" : "text-muted"}`}>Search</span>
        </Link>
        <Link href="/discover" className="flex flex-col items-center gap-0.5 px-3">
          <Compass size={20} strokeWidth={2} className={pathname.startsWith("/discover") ? "text-oxblood" : "text-muted"} />
          <span className={`font-mono text-[8px] tracking-[0.12em] uppercase ${pathname.startsWith("/discover") ? "text-oxblood" : "text-muted"}`}>Discover</span>
        </Link>
        <Link href="/briefs" className="flex flex-col items-center gap-0.5 px-3">
          <Bookmark size={20} strokeWidth={2} className={pathname.startsWith("/briefs") ? "text-oxblood" : "text-muted"} />
          <span className={`font-mono text-[8px] tracking-[0.12em] uppercase ${pathname.startsWith("/briefs") ? "text-oxblood" : "text-muted"}`}>Briefs</span>
        </Link>
        <Link href="/synthesis" className="flex flex-col items-center gap-0.5 px-3">
          <PenTool size={20} strokeWidth={2} className={pathname.startsWith("/synthesis") ? "text-oxblood" : "text-muted"} />
          <span className={`font-mono text-[8px] tracking-[0.12em] uppercase ${pathname.startsWith("/synthesis") ? "text-oxblood" : "text-muted"}`}>Drafts</span>
        </Link>
      </nav>

      <QuickSaveModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
