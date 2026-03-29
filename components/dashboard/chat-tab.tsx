"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ChatWorkspace } from "../chat/chat-workspace";
import { useState } from "react";
import { Plus } from "@phosphor-icons/react";

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
      <div className="flex items-center justify-between flex-shrink-0 px-5 py-2">
        <div className="flex gap-2 overflow-x-auto">
          {sessions &&
            sessions.length > 1 &&
            sessions.map((s: { _id: Id<"chatSessions">; title?: string }) => (
              <button
                key={s._id}
                onClick={() => setActiveSessionId(s._id)}
                className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors duration-150 ${
                  activeSession === s._id
                    ? "bg-accent/15 text-accent"
                    : "bg-elevated text-[#666666] hover:text-[#AAAAAA]"
                }`}
              >
                {s.title || "Samtale"}
              </button>
            ))}
        </div>
        <button
          onClick={handleNewSession}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent text-base rounded-lg hover:brightness-90 transition-all duration-150 font-medium"
        >
          <Plus size={14} weight="bold" />
          Ny samtale
        </button>
      </div>

      {activeSession ? (
        <div className="flex-1 min-h-0">
        <ChatWorkspace
          companyId={companyId}
          sessionId={activeSession}
          companyName={companyName}
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
