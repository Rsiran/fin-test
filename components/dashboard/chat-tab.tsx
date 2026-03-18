"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ChatInterface } from "../chat-interface";
import { useState } from "react";
import { Plus } from "@phosphor-icons/react";

export function ChatTab({ companyId }: { companyId: Id<"companies"> }) {
  const sessions = useQuery(api.chatSessions.listByCompany, { companyId });
  const createSession = useMutation(api.chatSessions.create);
  const [activeSessionId, setActiveSessionId] = useState<Id<"chatSessions"> | null>(null);

  const handleNewSession = async () => {
    const id = await createSession({ companyId, title: "Ny samtale" });
    setActiveSessionId(id);
  };

  const activeSession = activeSessionId ?? sessions?.[0]?._id ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Chat</h2>
        <button
          onClick={handleNewSession}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent text-base rounded-lg hover:brightness-90 transition-all duration-150 font-medium"
        >
          <Plus size={14} weight="bold" />
          Ny samtale
        </button>
      </div>

      {sessions && sessions.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {sessions.map((s) => (
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
      )}

      {activeSession ? (
        <ChatInterface companyId={companyId} sessionId={activeSession} />
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
