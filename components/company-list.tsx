"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";

export function CompanyList() {
  const companies = useQuery(api.companies.list);

  if (companies === undefined) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28" />
        ))}
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-lg text-[#666666]">Ingen selskaper lagt til ennå</p>
        <p className="text-sm text-[#666666] mt-1">
          Legg til et selskap for å komme i gang
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {companies.map((company) => (
        <Link
          key={company._id}
          href={`/selskap/${company._id}`}
          className="block p-5 bg-elevated rounded-card shadow-card hover:shadow-card-hover transition-shadow duration-150"
        >
          <h3 className="text-base font-semibold font-sans">{company.name}</h3>
          {company.ticker && (
            <span className="text-[11px] font-mono text-[#666666]">
              {company.ticker}
            </span>
          )}
          {company.description && (
            <p className="text-[13px] text-[#AAAAAA] mt-2 line-clamp-2">
              {company.description}
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}
