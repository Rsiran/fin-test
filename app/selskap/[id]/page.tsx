"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { DashboardTabs } from "@/components/dashboard/tabs";
import Link from "next/link";
import { CaretLeft, Trash, Warning } from "@phosphor-icons/react";
import { useState } from "react";

export default function CompanyPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as Id<"companies">;
  const company = useQuery(api.companies.get, { id: companyId });
  const removeCompany = useMutation(api.companies.removeWithData);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    await removeCompany({ id: companyId });
    router.push("/");
  };

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
        <div className="ml-auto">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-[#666666] hover:text-negative transition-colors duration-150"
            title="Slett selskap"
          >
            <Trash size={18} />
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-elevated border border-white/10 rounded-card p-6 max-w-md w-full mx-4 shadow-card">
            <div className="flex items-start gap-3">
              <Warning size={24} className="text-negative mt-0.5 shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-[#F5F5F5] mb-2">
                  Slett {company.name}?
                </h3>
                <p className="text-sm text-[#AAAAAA]">
                  Dette sletter alle dokumenter, nøkkeltall, chat-historikk og annen
                  data knyttet til selskapet. Handlingen kan ikke angres.
                </p>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="px-3 py-1.5 text-xs bg-negative text-white rounded-lg hover:brightness-90 transition-all duration-150 disabled:opacity-50"
                  >
                    {isDeleting ? "Sletter..." : "Ja, slett selskapet"}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                    className="px-3 py-1.5 text-xs text-[#AAAAAA] border border-white/10 rounded-lg hover:text-[#F5F5F5] transition-all duration-150"
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <DashboardTabs companyId={companyId} />
    </main>
  );
}
