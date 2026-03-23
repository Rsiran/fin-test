"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { CompanyDashboardCard } from "@/components/dashboard/company-dashboard-card";
import { AddCompanyDialog } from "@/components/add-company-dialog";
import { Plus } from "@phosphor-icons/react";
import Link from "next/link";

export default function DashboardPage() {
  const companies = useQuery(api.watchlist.listMyCompanies);
  const [showDialog, setShowDialog] = useState(false);

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-sans">FinansAnalyse</h1>
          <p className="mt-1 text-sm text-[#AAAAAA]">Dine selskaper</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/browse"
            className="px-4 py-2 text-sm text-[#AAAAAA] border border-white/10 rounded-lg hover:text-[#F5F5F5] transition-all duration-150 font-medium"
          >
            Utforsk
          </Link>
          <button
            onClick={() => setShowDialog(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-accent text-base rounded-lg hover:brightness-90 transition-all duration-150 font-medium"
          >
            <Plus size={16} weight="bold" />
            Nytt selskap
          </button>
        </div>
      </div>

      {companies === undefined ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-28" />
          ))}
        </div>
      ) : companies.length === 0 ? (
        <DashboardEmpty />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((company: { _id: Id<"companies">; name: string; ticker?: string; description?: string }) => (
            <CompanyDashboardCard
              key={company._id}
              id={company._id}
              name={company.name}
              ticker={company.ticker}
              description={company.description}
            />
          ))}
        </div>
      )}

      <AddCompanyDialog open={showDialog} onClose={() => setShowDialog(false)} />
    </main>
  );
}
