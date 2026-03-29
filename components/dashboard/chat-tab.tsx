"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ChatWorkspace } from "../chat/chat-workspace";
import { useState } from "react";

export function ChatTab({
  companyId,
  companyName,
}: {
  companyId: Id<"companies">;
  companyName: string;
}) {
  const sessions = useQuery(api.chatSessions.listByCompany, { companyId });
  const createSession = useMutation(api.chatSessions.create);
  const [activeSessionId, setActiveSessionId] = useState<Id<"chatSessions"> | null>(null);

  const handleNewSession = async () => {
    const id = await createSession({ companyId, title: "Ny samtale" });
    setActiveSessionId(id);
  };

  const activeSession = activeSessionId ?? sessions?.[0]?._id ?? null;

  return (
    <div className="flex flex-col h-full">
      {activeSession ? (
        <div className="flex-1 min-h-0">
          <ChatWorkspace
            companyId={companyId}
            sessionId={activeSession}
            companyName={companyName}
            sessions={sessions ?? []}
            onSelectSession={setActiveSessionId}
            onNewSession={handleNewSession}
          />
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-[#666666]">Ingen samtaler enda</p>
          <button
            onClick={handleNewSession}
            className="mt-3 px-4 py-2 bg-accent text-base rounded-lg text-sm font-medium hover:brightness-90 transition-all duration-150"
          >
            Start en samtale
          </button>
        </div>
      )}
    </div>
  );
}
