"use client";

import { X, Plus, ChatCircle } from "@phosphor-icons/react";
import { Id } from "@/convex/_generated/dataModel";

interface Session {
  _id: Id<"chatSessions">;
  title?: string;
  createdAt: number;
}

interface SessionsPanelProps {
  sessions: Session[];
  activeSessionId: Id<"chatSessions"> | null;
  onSelect: (id: Id<"chatSessions">) => void;
  onNew: () => void;
  onClose: () => void;
}

function formatDate(ts: number): string {
  const now = new Date();
  const date = new Date(ts);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "I dag";
  if (diffDays === 1) return "I går";
  if (diffDays < 7) return `${diffDays} dager siden`;
  return date.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
}

function groupByDate(sessions: Session[]): { label: string; sessions: Session[] }[] {
  const now = new Date();
  const groups: Record<string, Session[]> = {};
  const order: string[] = [];

  for (const s of sessions) {
    const date = new Date(s.createdAt);
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    let label: string;
    if (diffDays === 0) label = "I dag";
    else if (diffDays === 1) label = "I går";
    else if (diffDays < 7) label = "Denne uken";
    else if (diffDays < 30) label = "Denne måneden";
    else label = "Eldre";

    if (!groups[label]) {
      groups[label] = [];
      order.push(label);
    }
    groups[label].push(s);
  }

  return order.map((label) => ({ label, sessions: groups[label] }));
}

export function SessionsPanel({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onClose,
}: SessionsPanelProps) {
  const grouped = groupByDate(sessions);

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 z-10"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute left-0 top-0 bottom-0 w-[300px] bg-[#161618] border-r border-white/[0.06] z-20 flex flex-col animate-slide-in-left">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
          <span className="font-mono text-[10px] tracking-[2px] uppercase text-[#555]">
            Samtaler
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onNew}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono bg-accent/[0.1] text-accent border border-accent/[0.2] rounded hover:bg-accent/[0.2] transition-colors"
            >
              <Plus size={10} weight="bold" />
              Ny
            </button>
            <button
              onClick={onClose}
              className="text-[#555] hover:text-[#999] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto py-2">
          {grouped.map((group) => (
            <div key={group.label}>
              <div className="px-4 py-1.5 text-[9px] font-mono tracking-[1.5px] uppercase text-[#444]">
                {group.label}
              </div>
              {group.sessions.map((s) => {
                const isActive = activeSessionId === s._id;
                return (
                  <button
                    key={s._id}
                    onClick={() => {
                      onSelect(s._id);
                      onClose();
                    }}
                    className={`w-full px-4 py-2.5 flex items-center gap-2.5 text-left transition-colors ${
                      isActive
                        ? "bg-accent/[0.06] text-accent"
                        : "text-[#888] hover:bg-white/[0.03] hover:text-[#ccc]"
                    }`}
                  >
                    <ChatCircle
                      size={14}
                      weight={isActive ? "fill" : "regular"}
                      className="flex-shrink-0"
                    />
                    <span className="text-[12px] truncate flex-1">
                      {s.title || "Ny samtale"}
                    </span>
                    <span className="text-[9px] font-mono text-[#444] flex-shrink-0">
                      {formatDate(s.createdAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}

          {sessions.length === 0 && (
            <div className="px-4 py-8 text-center text-[#444] text-[11px]">
              Ingen samtaler enda
            </div>
          )}
        </div>
      </div>
    </>
  );
}
