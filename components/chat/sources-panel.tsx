"use client";

import { useEffect, useRef } from "react";
import type { SourceMeta } from "./cited-text";

interface SourcesPanelProps {
  sources: SourceMeta[];
  activeSourceIndex: number | null;
  onSourceClick: (source: SourceMeta) => void;
}

export function SourcesPanel({ sources, activeSourceIndex, onSourceClick }: SourcesPanelProps) {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeSourceIndex]);

  return (
    <div className="w-[380px] flex-shrink-0 flex flex-col bg-white/[0.01] border-l border-white/[0.06]">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[2px] uppercase text-[#555]">
          Kilder
        </span>
        {sources.length > 0 && (
          <span className="font-mono text-[9px] text-[#444] px-1.5 py-0.5 bg-white/[0.04] rounded">
            {sources.length} {sources.length === 1 ? "kilde" : "kilder"}
          </span>
        )}
      </div>

      {/* Source list */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
        {sources.length === 0 ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-2 text-[#333]">
            <span className="text-[11px]">Ingen kilder enda</span>
          </div>
        ) : (
          sources.map((source) => {
            const isActive = activeSourceIndex === source.index;
            return (
              <div
                key={source.index}
                ref={isActive ? activeRef : undefined}
                onClick={() => onSourceClick(source)}
                className={`p-3.5 rounded-lg border cursor-pointer transition-all duration-200 ${
                  isActive
                    ? "bg-accent/[0.04] border-accent/[0.15]"
                    : "bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.035] hover:border-white/[0.08]"
                }`}
              >
                {/* Card header */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      isActive
                        ? "bg-accent/[0.25] text-accent"
                        : "bg-accent/[0.12] text-accent"
                    }`}
                  >
                    {source.index}
                  </span>
                  {source.pageRange && (
                    <span className="font-mono text-[10px] text-[#555]">
                      s. {source.pageRange}
                    </span>
                  )}
                </div>

                {/* Excerpt */}
                <div
                  className={`text-xs font-mono leading-relaxed border-l-2 pl-2.5 ${
                    isActive
                      ? "text-[#888] border-accent/[0.2]"
                      : "text-[#666] border-white/[0.06]"
                  }`}
                >
                  {source.content.length > 300
                    ? source.content.substring(0, 300) + "…"
                    : source.content}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
