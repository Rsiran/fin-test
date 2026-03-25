"use client";

import { useCallback, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { SearchBar } from "@/components/browse/search-bar";
import { CompanyBrowseCard } from "@/components/browse/company-browse-card";
import { CaretLeft } from "@phosphor-icons/react";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";

export default function BrowsePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const companies = useQuery(api.companies.search, {
    query: searchQuery || undefined,
  });
  const myCompanies = useQuery(api.watchlist.listMyCompanies);

  const bookmarkedIds = new Set(
    myCompanies?.map((c: { _id: Id<"companies"> }) => c._id) ?? []
  );

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
  }, []);

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/dashboard"
          className="text-[#666666] hover:text-[#AAAAAA] transition-colors duration-150"
        >
          <CaretLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold font-sans">Utforsk selskaper</h1>
          <p className="mt-1 text-sm text-[#AAAAAA]">
            Søk i databasen og legg til selskaper i din oversikt
          </p>
        </div>
        <LogoutButton />
      </div>

      <div className="mb-6">
        <SearchBar onSearch={handleSearch} />
      </div>

      {companies === undefined ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton h-28" />
          ))}
        </div>
      ) : companies.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-lg text-[#666666]">
            {searchQuery ? "Ingen selskaper funnet" : "Ingen selskaper i databasen ennå"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((company: { _id: Id<"companies">; name: string; ticker?: string; reportCount: number; lastReportDate: number | null }) => (
            <CompanyBrowseCard
              key={company._id}
              id={company._id}
              name={company.name}
              ticker={company.ticker}
              reportCount={company.reportCount}
              lastReportDate={company.lastReportDate}
              isBookmarked={bookmarkedIds.has(company._id)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
