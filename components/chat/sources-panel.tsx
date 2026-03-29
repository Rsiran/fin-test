"use client";

import { X } from "@phosphor-icons/react";
import type { SourceMeta } from "./cited-text";

interface SourcesPanelProps {
  source: SourceMeta | null;
  onClose: () => void;
}

export function SourcesPanel({ source, onClose }: SourcesPanelProps) {
  return (
    <div className="w-[380px] flex-shrink-0 flex flex-col bg-white/[0.01] border-l border-white/[0.06]">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[2px] uppercase text-[#555]">
          Kilde
        </span>
        {source && (
          <button
            onClick={onClose}
            className="text-[#555] hover:text-[#999] transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {source ? (
          <div className="animate-fade-in-up">
            {/* Source header */}
            <div className="flex items-center gap-2 mb-3">
              <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-accent/[0.25] text-accent">
                {source.index}
              </span>
              {source.pageRange && (
                <span className="font-mono text-[10px] text-[#555]">
                  s. {source.pageRange}
                </span>
              )}
            </div>

            {/* Full excerpt */}
            <div className="text-xs font-mono leading-relaxed text-[#888] border-l-2 border-accent/[0.2] pl-3 whitespace-pre-wrap">
              {source.content}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center h-full text-[#333]">
            <span className="text-[11px]">Klikk en kildehenvisning for å se detaljer</span>
          </div>
        )}
      </div>
    </div>
  );
}
