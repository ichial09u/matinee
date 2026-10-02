"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Play, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { backdropUrl, fetchDetails, logoUrl, matchPercent } from "@/lib/api";
import type { MediaItem } from "@/lib/types";

interface HeroProps {
  items: MediaItem[];
  onPlay?: (item: MediaItem) => void;
  onMoreInfo?: (item: MediaItem) => void;
}

/**
 * Netflix-style billboard: full-bleed backdrop, title logo (falls back to
 * plain type), TOP 10 badge, match %, Play + More Info buttons, maturity
 * tag on the right edge, left + bottom gradients.
 */
export function Hero({ items, onPlay, onMoreInfo }: HeroProps) {
  const featured = items.filter((i) => i.backdrop).slice(0, 5);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (featured.length <= 1) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % featured.length);
    }, 9000);
    return () => clearInterval(t);
  }, [featured.length]);

  const item = featured[idx];

  // Title logo + maturity rating for the current billboard item
  const detailQ = useQuery({
    queryKey: ["hero-detail", item?.mediaType, item?.id],
    queryFn: () => fetchDetails(item!.id, item!.mediaType),
    enabled: Boolean(item),
    staleTime: 600_000,
  });

  if (featured.length === 0 || !item) return null;

  const match = matchPercent(item.rating);
  const logo = detailQ.data?.logo ? logoUrl(detailQ.data.logo, "w500") : null;
  const certification = detailQ.data?.certification || null;

  return (
    <section
      className="relative h-[68vh] min-h-[480px] w-full overflow-hidden sm:h-[56.25vw] sm:max-h-[85vh]"
      aria-label="Featured today"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={item.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute inset-0"
        >
          <img
            src={backdropUrl(item.backdrop, "original")}
            alt=""
            className="h-full w-full object-cover object-center"
          />
        </motion.div>
      </AnimatePresence>

      {/* Netflix gradients: left for copy, bottom into the page */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-[#141414]/30" />

      {/* Copy block */}
      <div className="relative flex h-full max-w-[1280px] flex-col justify-end px-4 pb-[12%] sm:px-[3.5vw] sm:pb-[22%]">
        <AnimatePresence mode="wait">
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="max-w-[36rem]"
          >
            {/* Series / Film badge + TOP 10 */}
            <div className="mb-3 flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[2px] bg-[#e50914] font-logo text-[13px] leading-none text-white">
                  M
                </span>
                <span className="text-[13px] font-semibold tracking-[0.18em] text-[#e5e5e5]">
                  {item.mediaType === "tv" ? "SERIES" : "FILM"}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="flex h-[22px] w-[32px] flex-col items-center justify-center rounded-[2px] bg-[#e50914] leading-none">
                  <span className="text-[7px] font-bold tracking-wider text-white">TOP</span>
                  <span className="text-[11px] font-black leading-[0.95] text-white">10</span>
                </span>
                <span className="text-[13px] font-medium text-white">
                  {item.mediaType === "tv" ? "in TV Shows Today" : "in Movies Today"}
                </span>
              </span>
            </div>

            {/* Title — logo treatment, plain type fallback */}
            {logo ? (
              <div className="mb-3 max-w-[75%]">
                <img
                  src={logo}
                  alt={item.title}
                  className="h-auto max-h-[120px] w-auto max-w-full drop-shadow-lg"
                />
              </div>
            ) : (
              <h1 className="mb-3 text-3xl font-black leading-[1.05] text-white drop-shadow-lg sm:text-5xl md:text-6xl">
                {item.title}
              </h1>
            )}

            {/* Meta line */}
            <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px]">
              {match && (
                <span className="font-semibold text-[#46d369]">{match}% Match</span>
              )}
              {item.year && <span className="text-[#d2d2d2]">{item.year}</span>}
              {certification && (
                <span className="border border-white/40 px-1.5 text-[11px] text-[#d2d2d2]">
                  {certification}
                </span>
              )}
              <span className="border border-white/40 px-1.5 text-[11px] text-[#d2d2d2]">
                HD
              </span>
              {item.mediaType === "tv" && (
                <span className="text-[#d2d2d2]">TV</span>
              )}
            </div>

            {/* Synopsis */}
            <p className="line-clamp-3 max-w-[34rem] text-[14px] leading-relaxed text-white/90 drop-shadow-md sm:text-base">
              {item.overview}
            </p>

            {/* Buttons */}
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => onPlay?.(item)}
                className="inline-flex items-center gap-2 rounded-[4px] bg-white px-5 py-2 text-[15px] font-bold text-black transition-colors hover:bg-white/75 sm:px-7 sm:py-2.5"
              >
                <Play className="h-5 w-5 fill-current" aria-hidden />
                Play
              </button>
              <button
                type="button"
                onClick={() => onMoreInfo?.(item)}
                className="inline-flex items-center gap-2 rounded-[4px] bg-[#6d6d6eb3] px-5 py-2 text-[15px] font-semibold text-white transition-colors hover:bg-[#6d6d6e66] sm:px-7 sm:py-2.5"
              >
                <Info className="h-5 w-5" aria-hidden />
                More Info
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Maturity tag, right edge */}
      {certification && (
        <div className="absolute bottom-[22%] right-0 hidden items-center border-l-[3px] border-white/50 bg-black/40 py-0.5 pl-2.5 pr-6 text-[13px] text-white/80 sm:flex">
          Rated {certification}
        </div>
      )}

      {/* Rotation dashes, bottom right */}
      <div className="absolute bottom-[24%] right-4 flex items-center gap-1 sm:right-8">
        {featured.map((f, i) => (
          <button
            key={f.id}
            type="button"
            aria-label={`Show ${f.title}`}
            onClick={() => setIdx(i)}
            className={cn(
              "h-[3px] transition-all duration-300",
              i === idx
                ? "w-6 bg-[#e50914]"
                : "w-3.5 bg-white/40 hover:bg-white/70"
            )}
          />
        ))}
      </div>
    </section>
  );
}
