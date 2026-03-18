"use client";

import { useState } from "react";
import { CompanyList } from "@/components/company-list";
import { AddCompanyDialog } from "@/components/add-company-dialog";
import { Plus } from "@phosphor-icons/react";

export default function Home() {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-sans">FinansAnalyse</h1>
          <p className="mt-1 text-sm text-[#AAAAAA]">
            Analyser norske selskaper gjennom finansrapporter
          </p>
        </div>
        <button
          onClick={() => setShowDialog(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-accent text-base rounded-lg hover:brightness-90 transition-all duration-150 font-medium"
        >
          <Plus size={16} weight="bold" />
          Legg til selskap
        </button>
      </div>
      <CompanyList />
      <AddCompanyDialog open={showDialog} onClose={() => setShowDialog(false)} />
    </main>
  );
}
