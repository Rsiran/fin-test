"use client";

import { Id } from "@/convex/_generated/dataModel";

export function OverviewTab({ companyId }: { companyId: Id<"companies"> }) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Oversikt</h2>
      <p className="text-sm text-[#666666]">
        Last opp rapporter under Dokumenter-fanen for å se finansielle nøkkeltall.
      </p>
    </div>
  );
}
