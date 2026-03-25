"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

export function NameRegistrationModal() {
  const profile = useQuery(api.users.meProfile);
  const setName = useMutation(api.users.setName);
  const [name, setNameValue] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill with current name once loaded
  if (profile && !initialized) {
    setNameValue(profile.name ?? "");
    setInitialized(true);
  }

  // Don't render if still loading, not authenticated, or already confirmed
  if (profile === undefined || profile === null || profile.nameConfirmed) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Skriv inn fornavnet ditt");
      return;
    }
    if (trimmed.length > 50) {
      setError("Navnet kan maks være 50 tegn");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await setName({ name: trimmed });
    } catch {
      setError("Noe gikk galt. Prøv igjen.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-elevated rounded-card shadow-card p-6 w-full max-w-md">
        <div className="text-center mb-5">
          <h2 className="text-lg font-semibold">Velkommen!</h2>
          <p className="text-sm text-[#888888] mt-1">
            Skriv inn fornavnet ditt for å komme i gang
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[9px] font-sans uppercase tracking-[1px] text-[#666666] mb-1.5">
              Fornavn
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setNameValue(e.target.value);
                setError("");
              }}
              placeholder="f.eks. Ola"
              className="w-full bg-base rounded-lg px-3 py-2.5 text-sm shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] placeholder:text-[#666666]"
              autoFocus
              maxLength={50}
            />
            {error && (
              <p className="text-[#f87171] text-xs mt-1.5">{error}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full px-4 py-2.5 text-sm bg-accent text-base rounded-lg hover:brightness-90 transition-all duration-150 font-medium disabled:opacity-50"
          >
            {saving ? "Lagrer..." : "Lagre"}
          </button>
        </form>
      </div>
    </div>
  );
}
