"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { DashboardTabs } from "@/components/dashboard/tabs";
import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react";

export default function CompanyPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const company = useQuery(api.companies.get, { id: companyId });

  if (company === undefined) {
    return (
      <div className="min-h-screen p-8">
        <div className="skeleton h-8 w-48 mb-4" />
        <div className="skeleton h-96" />
      </div>
    );
  }

  if (company === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-negative">Selskap ikke funnet</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="border-b border-white/5 px-8 py-4 flex items-center gap-3">
        <Link
          href="/"
          className="text-[#666666] hover:text-[#AAAAAA] transition-colors duration-150"
        >
          <CaretLeft size={18} />
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{company.name}</span>
          {company.ticker && (
            <span className="text-[11px] font-mono text-[#666666]">
              {company.ticker}
            </span>
          )}
        </div>
      </div>

      <DashboardTabs companyId={companyId} />
    </main>
  );
}
