"use client";

import { useEffect, useState } from "react";
import {
  Search,
  Bookmark,
  Clapperboard,
  Home,
  Tv,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewName =
  | "home"
  | "browse"
  | "tv"
  | "search"
  | "list";

interface HeaderProps {
  view: ViewName;
  onNavigate: (view: ViewName) => void;
  onSearch: (q: string) => void;
  listCount: number;
}

const NAV: { id: ViewName; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "tv", label: "TV Shows" },
  { id: "browse", label: "Movies" },
  { id: "list", label: "My List" },
];

const MOBILE_TABS: { id: ViewName; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "tv", label: "TV", icon: Tv },
  { id: "browse", label: "Movies", icon: Clapperboard },
  { id: "list", label: "My List", icon: Bookmark },
];

/** Netflix-style chrome: transparent gradient over the billboard, solid on
 *  scroll; expanding search; avatar dropdown; mobile bottom tab bar. */
export function Header({
  view,
  onNavigate,
  onSearch,
  listCount,
}: HeaderProps) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) onSearch(q);
  };

  // Over the home billboard the header floats on a gradient; elsewhere solid
  const overHero = view === "home" && !scrolled;

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
          overHero
            ? "bg-gradient-to-b from-black/80 via-black/40 to-transparent"
            : "bg-[#141414]"
        )}
      >
        <div className="mx-auto flex h-14 items-center gap-4 px-4 md:h-[68px] md:gap-6 md:px-[3.5vw]">
          {/* Wordmark */}
          <button
            type="button"
            className="shrink-0 text-[#e50914]"
            onClick={() => onNavigate("home")}
            aria-label="Matinee — Home"
          >
            <span className="font-logo text-[26px] leading-none tracking-[0.02em] md:text-[34px]">
              MATINEE
            </span>
          </button>

          {/* Desktop nav */}
          <nav
            className="hidden items-center gap-5 lg:flex"
            aria-label="Main navigation"
          >
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onNavigate(n.id)}
                className={cn(
                  "text-[14px] transition-colors",
                  view === n.id
                    ? "font-semibold text-white"
                    : "text-[#e5e5e5] hover:text-[#b3b3b3]"
                )}
              >
                {n.label}
              </button>
            ))}
          </nav>

          <div className="flex-1" />

          {/* Search — expands on click, Netflix style */}
          <form
            role="search"
            onSubmit={submit}
            className="flex items-center justify-end"
          >
            {searchOpen ? (
              <div className="flex items-center border border-white/70 bg-black/80 px-2 transition-all">
                <Search
                  className="h-4 w-4 shrink-0 text-white/80"
                  aria-hidden
                />
                <input
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onBlur={() => {
                    if (!query.trim()) setSearchOpen(false);
                  }}
                  placeholder="Titles, people, genres"
                  aria-label="Search movies and TV shows"
                  className="w-[150px] bg-transparent px-2 py-1.5 text-[13px] text-white outline-none placeholder:text-white/50 sm:w-[210px]"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    className="px-1 text-white/60 hover:text-white"
                    onClick={() => setQuery("")}
                  >
                    ✕
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                aria-label="Search"
                onClick={() => setSearchOpen(true)}
                className="p-1 text-white transition-colors hover:text-white/70"
              >
                <Search className="h-5 w-5" aria-hidden />
              </button>
            )}
          </form>

          {/* Avatar + dropdown menu */}
          <div className="relative">
            <button
              type="button"
              aria-label="Account menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((m) => !m)}
              className="flex items-center gap-1.5"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-[4px] bg-[#e50914]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                  <circle cx="12" cy="10" r="1.8" fill="#fff" />
                  <circle cx="7" cy="10" r="1.8" fill="#fff" />
                  <circle cx="17" cy="10" r="1.8" fill="#fff" />
                  <path
                    d="M6 14.5c1.8 1.6 3.8 2.4 6 2.4s4.2-.8 6-2.4"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <svg
                viewBox="0 0 24 24"
                className={cn(
                  "hidden h-3 w-3 text-white transition-transform md:block",
                  menuOpen && "rotate-180"
                )}
                aria-hidden
              >
                <path
                  d="M6 9l6 6 6-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            {menuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setMenuOpen(false)}
                  tabIndex={-1}
                />
                <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-[4px] border border-white/10 bg-[#141414] py-2 text-[13px] shadow-2xl">
                  {[
                    {
                      label: "My List",
                      icon: Bookmark,
                      badge: listCount || null,
                      action: () => onNavigate("list"),
                    },
                    {
                      label: "TV Shows",
                      icon: Tv,
                      action: () => onNavigate("tv"),
                    },
                    {
                      label: "Movies",
                      icon: Clapperboard,
                      action: () => onNavigate("browse"),
                    },
                  ].map((mi) => (
                    <button
                      key={mi.label}
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        mi.action();
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[#e5e5e5] transition-colors hover:underline"
                    >
                      <mi.icon className="h-4 w-4 shrink-0" aria-hidden />
                      {mi.label}
                      {mi.badge != null && (
                        <span className="ml-auto text-[#b3b3b3]">
                          {mi.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around border-t border-white/10 bg-[#141414] pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Mobile navigation"
      >
        {MOBILE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onNavigate(t.id)}
            className={cn(
              "flex min-w-[54px] flex-col items-center gap-1 py-2",
              view === t.id ? "text-white" : "text-[#777]"
            )}
          >
            <t.icon className="h-5 w-5" aria-hidden />
            <span className="text-[10px]">{t.label}</span>
            {t.id === "list" && listCount > 0 && (
              <span className="absolute -mt-6 ml-6 rounded-full bg-[#e50914] px-1 text-[9px] font-semibold text-white">
                {listCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </>
  );
}
