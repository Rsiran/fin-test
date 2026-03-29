"use client";

import { CitedText, type SourceMeta } from "./cited-text";
import { InlineChart, type ChartConfig } from "./inline-chart";

interface MessageProps {
  role: "user" | "assistant";
  content: string;
  sources?: SourceMeta[];
  chart?: ChartConfig;
  onCiteClick?: (source: SourceMeta) => void;
  isStreaming?: boolean;
}

export function Message({
  role,
  content,
  sources = [],
  chart,
  onCiteClick,
  isStreaming,
}: MessageProps) {
  const isUser = role === "user";

  return (
    <div className={`max-w-[90%] ${isUser ? "self-end" : "self-start"}`}>
      {/* Label */}
      <div className="font-mono text-[9px] tracking-[1.5px] uppercase text-[#555] mb-1">
        {isUser ? "Du" : "Analyse"}
      </div>

      {/* Message body */}
      <div
        className={`px-4 py-3 rounded-r-md text-sm leading-relaxed ${
          isUser
            ? "border-l-2 border-accent/[0.35] bg-accent/[0.06] text-[#ddd]"
            : "border-l-2 border-white/[0.08] bg-white/[0.025] text-[#b0b0b0]"
        }`}
      >
        {!isUser && sources.length > 0 && onCiteClick ? (
          <CitedText text={content} sources={sources} onCiteClick={onCiteClick} />
        ) : (
          <span className="whitespace-pre-wrap">{content}</span>
        )}

        {/* Streaming cursor */}
        {isStreaming && (
          <span className="inline-block w-0.5 h-3.5 bg-accent ml-0.5 align-middle animate-pulse" />
        )}

        {/* Inline chart */}
        {chart && <InlineChart config={chart} />}

        {/* Source chips */}
        {!isUser && sources.length > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-white/[0.04] flex gap-1.5 flex-wrap items-center">
            <span className="font-mono text-[9px] tracking-[1.5px] uppercase text-[#444] mr-1">
              Kilder
            </span>
            {sources.map((s) => (
              <button
                key={s.index}
                onClick={() => onCiteClick?.(s)}
                className="font-mono text-[9px] px-2 py-0.5 rounded bg-accent/[0.06] text-accent border border-accent/[0.15] hover:bg-accent/[0.15] hover:border-accent/[0.3] transition-colors cursor-pointer"
              >
                {s.index} · {s.pageRange ? `s. ${s.pageRange}` : `kilde`}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
