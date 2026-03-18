"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { X } from "@phosphor-icons/react";

export function AddCompanyDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const createCompany = useMutation(api.companies.create);
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createCompany({
      name: name.trim(),
      ticker: ticker.trim() || undefined,
    });
    setName("");
    setTicker("");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-elevated rounded-card shadow-card p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Legg til selskap</h2>
          <button
            onClick={onClose}
            className="text-[#666666] hover:text-[#F5F5F5] transition-colors duration-150"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[9px] font-sans uppercase tracking-[1px] text-[#666666] mb-1.5">
              Selskapsnavn
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="f.eks. Equinor ASA"
              className="w-full bg-base rounded-lg px-3 py-2.5 text-sm shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] placeholder:text-[#666666]"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-[9px] font-sans uppercase tracking-[1px] text-[#666666] mb-1.5">
              Ticker (valgfritt)
            </label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="f.eks. EQNR"
              className="w-full bg-base rounded-lg px-3 py-2.5 text-sm font-mono shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] placeholder:text-[#666666]"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-[#AAAAAA] border border-white/10 rounded-lg hover:text-[#F5F5F5] hover:border-white/20 transition-all duration-150"
            >
              Avbryt
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-accent text-base rounded-lg hover:brightness-90 transition-all duration-150 font-medium"
            >
              Legg til
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
