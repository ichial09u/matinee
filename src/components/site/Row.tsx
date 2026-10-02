"use client";

import {
  Children,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface RowProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}

/**
 * Netflix-style slider: bold row title, thin card gap, tall translucent
 * chevron bars that appear when the row is hovered.
 */
export function Row({ title, children, action }: RowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);
  const count = Children.count(children);

  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      ro.disconnect();
    };
  }, []);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.9), behavior: "smooth" });
  };

  return (
    <section className="group/row relative" aria-label={title}>
      <div className="mb-2 flex items-center gap-2 px-4 md:px-[3.5vw]">
        <h2 className="whitespace-nowrap text-[1.25rem] font-semibold text-[#e5e5e5] md:text-[1.35rem]">
          {title}
        </h2>
        {count > 0 && (
          <span className="sr-only">{count} titles</span>
        )}
        {action}
      </div>

      <div className="relative">
        {canLeft && (
          <button
            type="button"
            aria-label={`Scroll ${title} left`}
            className="absolute bottom-0 left-0 top-0 z-20 hidden w-8 items-center justify-center rounded-r-[4px] bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover/row:opacity-100 md:flex"
            onClick={() => scrollBy(-1)}
          >
            <ChevronLeft className="h-7 w-7" aria-hidden />
          </button>
        )}
        <div
          ref={scrollRef}
          className="no-scrollbar flex gap-1 overflow-x-auto scroll-smooth px-4 pb-1 md:px-[3.5vw]"
          role="list"
        >
          {children}
        </div>
        {canRight && (
          <button
            type="button"
            aria-label={`Scroll ${title} right`}
            className="absolute bottom-0 right-0 top-0 z-20 hidden w-8 items-center justify-center rounded-l-[4px] bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover/row:opacity-100 md:flex"
            onClick={() => scrollBy(1)}
          >
            <ChevronRight className="h-7 w-7" aria-hidden />
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Top-10 slider: giant outlined rank numerals sitting to the LEFT of each
 * poster — fully visible, with the poster edge tucked slightly over the
 * numeral (Netflix "Top 10" look).
 */
export function Top10Row({
  title,
  children,
}: {
  title: string;
  children: ReactNode[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      ro.disconnect();
    };
  }, []);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.9), behavior: "smooth" });
  };

  return (
    <section className="group/row relative" aria-label={title}>
      <div className="mb-2 flex items-center gap-2 px-4 md:px-[3.5vw]">
        <h2 className="whitespace-nowrap text-[1.25rem] font-semibold text-[#e5e5e5] md:text-[1.35rem]">
          {title}
        </h2>
      </div>

      <div className="relative">
        {canLeft && (
          <button
            type="button"
            aria-label={`Scroll ${title} left`}
            className="absolute bottom-0 left-0 top-0 z-20 hidden w-8 items-center justify-center rounded-r-[4px] bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover/row:opacity-100 md:flex"
            onClick={() => scrollBy(-1)}
          >
            <ChevronLeft className="h-7 w-7" aria-hidden />
          </button>
        )}
        <div
          ref={scrollRef}
          className="no-scrollbar flex gap-1.5 overflow-x-auto scroll-smooth px-4 pb-1 pt-1 md:px-[3.5vw]"
          role="list"
        >
          {children.map((child, i) => (
            <div
              key={i}
              className="flex shrink-0 items-end"
              role="listitem"
            >
              <span
                aria-hidden
                className="nf-rank pointer-events-none -mr-2 w-[46px] shrink-0 text-right font-logo text-[96px] leading-[0.8] sm:-mr-3 sm:w-[56px] sm:text-[112px] md:w-[64px] md:text-[128px]"
              >
                {i + 1}
              </span>
              <div className="relative z-10">{child}</div>
            </div>
          ))}
        </div>
        {canRight && (
          <button
            type="button"
            aria-label={`Scroll ${title} right`}
            className="absolute bottom-0 right-0 top-0 z-20 hidden w-8 items-center justify-center rounded-l-[4px] bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover/row:opacity-100 md:flex"
            onClick={() => scrollBy(1)}
          >
            <ChevronRight className="h-7 w-7" aria-hidden />
          </button>
        )}
      </div>
    </section>
  );
}

/** Skeleton shelf while loading */
export function SkeletonRow({ label }: { label: string }) {
  return (
    <section aria-busy="true" aria-label={`Loading ${label}`}>
      <div className="mb-2 h-5 w-48 animate-pulse rounded bg-[#222] md:ml-[3.5vw]" />
      <div className="flex gap-1 overflow-hidden px-4 md:px-[3.5vw]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[2/3] w-[110px] shrink-0 animate-pulse rounded-[4px] bg-[#222] sm:w-[125px] md:w-[135px] lg:w-[150px]"
          />
        ))}
      </div>
    </section>
  );
}
