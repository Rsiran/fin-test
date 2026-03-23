"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { X } from "@phosphor-icons/react";

interface CompanyDashboardCardProps {
  id: Id<"companies">;
  name: string;
  ticker?: string;
  description?: string;
}

export function CompanyDashboardCard({ id, name, ticker, description }: CompanyDashboardCardProps) {
  const removeFromWatchlist = useMutation(api.watchlist.remove);

  const handleRemove = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await removeFromWatchlist({ companyId: id });
  };

  return (
    <Link
      href={`/selskap/${id}`}
      className="group relative block p-5 bg-elevated rounded-card shadow-card hover:shadow-card-hover transition-shadow duration-150"
    >
      <button
        onClick={handleRemove}
        className="absolute top-3 right-3 text-[#666666] hover:text-negative transition-colors duration-150 opacity-0 group-hover:opacity-100"
        title="Fjern fra oversikt"
      >
        <X size={14} />
      </button>
      <h3 className="text-base font-semibold font-sans !text-white">{name}</h3>
      {ticker && (
        <span className="text-[11px] font-mono !text-[#AAAAAA]">{ticker}</span>
      )}
      {description && (
        <p className="text-[13px] text-[#AAAAAA] mt-2 line-clamp-2">{description}</p>
      )}
    </Link>
  );
}
