"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@stackframe/stack";
import {
  Bookmark,
  Archive,
  PenTool,
  BookOpen,
  Search,
} from "lucide-react";

const NAV = [
  { href: "/briefs",    icon: Bookmark,  label: "Briefs"  },
  { href: "/dashboard", icon: BookOpen,  label: "All"     },
  { href: "/synthesis", icon: PenTool,   label: "Drafts"  },
  { href: "/search",    icon: Search,    label: "Search"  },
  { href: "/index",     icon: Archive,   label: "Index"   },
];

export function LeftRail() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname.startsWith("/dashboard");
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      {/* Desktop rail */}
      <nav className="hidden md:flex fixed left-0 top-0 h-screen w-[60px] flex-col items-center border-r border-rule bg-paper z-40">
        {/* Wordmark */}
        <div className="h-14 flex items-center justify-center">
          <span className="font-serif text-base font-semibold">
            M<span className="text-oxblood">·</span>
          </span>
        </div>

        {/* Nav icons */}
        <div className="flex-1 flex flex-col items-center gap-1 pt-2">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className="group relative flex items-center justify-center w-10 h-10 transition-colors"
                title={label}
              >
                {/* Active bar */}
                {active && (
                  <span className="absolute left-[-10px] w-[3px] h-5 bg-oxblood rounded-r" />
                )}
                <Icon
                  size={20}
                  strokeWidth={2}
                  className={`transition-colors ${active ? "text-oxblood" : "text-muted group-hover:text-ink"}`}
                />
                {/* Tooltip */}
                <span className="pointer-events-none absolute left-12 px-2 py-1 bg-ink text-paper font-mono text-[10px] tracking-[0.15em] uppercase whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity delay-100 z-50">
                  {label}
                </span>
              </Link>
            );
          })}
        </div>

        {/* User avatar at bottom */}
        <div className="h-14 flex items-center justify-center">
          <UserButton />
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 flex items-center justify-around border-t border-rule bg-paper z-40">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-0.5 px-3"
            >
              <Icon
                size={20}
                strokeWidth={2}
                className={active ? "text-oxblood" : "text-muted"}
              />
              <span className={`font-mono text-[8px] tracking-[0.12em] uppercase ${active ? "text-oxblood" : "text-muted"}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
