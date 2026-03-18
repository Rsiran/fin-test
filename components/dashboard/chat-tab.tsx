"use client";

import { Id } from "@/convex/_generated/dataModel";

export function ChatTab({ companyId }: { companyId: Id<"companies"> }) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Chat</h2>
      <p className="text-sm text-[#666666]">Chat-funksjonalitet kommer i neste steg.</p>
    </div>
  );
}
