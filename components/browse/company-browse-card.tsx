"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Star } from "@phosphor-icons/react";

interface CompanyBrowseCardProps {
  id: Id<"companies">;
  name: string;
  ticker?: string;
  reportCount: number;
  lastReportDate: number | null;
  isBookmarked: boolean;
}

export function CompanyBrowseCard({
  id,
  name,
  ticker,
  reportCount,
  lastReportDate,
  isBookmarked,
}: CompanyBrowseCardProps) {
  const addToWatchlist = useMutation(api.watchlist.add);
  const removeFromWatchlist = useMutation(api.watchlist.remove);

  const handleToggleBookmark = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isBookmarked) {
      await removeFromWatchlist({ companyId: id });
    } else {
      await addToWatchlist({ companyId: id });
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString("nb-NO", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <Link
      href={`/selskap/${id}`}
      className="group relative block p-5 bg-elevated rounded-card shadow-card hover:shadow-card-hover transition-shadow duration-150"
    >
      <button
        onClick={handleToggleBookmark}
        className="absolute top-3 right-3 transition-colors duration-150"
        title={isBookmarked ? "Fjern fra oversikt" : "Legg til i oversikt"}
      >
        {isBookmarked ? (
          <Star size={16} weight="fill" className="text-accent" />
        ) : (
          <Star size={16} className="text-[#666666] hover:text-accent" />
        )}
      </button>
      <h3 className="text-base font-semibold font-sans !text-white">{name}</h3>
      {ticker && (
        <span className="text-[11px] font-mono !text-[#AAAAAA]">{ticker}</span>
      )}
      <div className="mt-3 flex items-center gap-3 text-xs text-[#666666]">
        <span>{reportCount} {reportCount === 1 ? "rapport" : "rapporter"}</span>
        {lastReportDate && (
          <>
            <span className="text-white/10">|</span>
            <span>Sist oppdatert {formatDate(lastReportDate)}</span>
          </>
        )}
      </div>
    </Link>
  );
}
