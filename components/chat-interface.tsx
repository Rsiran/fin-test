"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { PaperPlaneRight, X } from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";

interface SourceMeta {
  index: number;
  chunkId: string;
  content: string;
  pageRange?: string;
}

/**
 * Render a citation button for [N] references.
 */
function CiteButton({
  idx,
  onCiteClick,
  sources,
}: {
  idx: number;
  onCiteClick: (source: SourceMeta) => void;
  sources: SourceMeta[];
}) {
  const source = sources.find((s) => s.index === idx);
  if (!source) return <span>[{idx}]</span>;
  return (
    <button
      onClick={() => onCiteClick(source)}
      className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-mono bg-accent/20 text-accent rounded-full hover:bg-accent/30 transition-colors duration-150 mx-0.5 align-super cursor-pointer"
      title={`Kilde ${idx}`}
    >
      {idx}
    </button>
  );
}

/**
 * Render markdown text with [N] citations as clickable inline references.
 * First replaces [N] with placeholders, renders markdown, then swaps placeholders for buttons.
 */
function CitedText({
  text,
  sources,
  onCiteClick,
}: {
  text: string;
  sources: SourceMeta[];
  onCiteClick: (source: SourceMeta) => void;
}) {
  // Replace [N] citations with unique placeholders that survive markdown rendering
  const CITE_PLACEHOLDER = "%%CITE_";
  const processed = text.replace(/\[(\d+)\]/g, (_, n) => `${CITE_PLACEHOLDER}${n}%%`);

  return (
    <ReactMarkdown
      components={{
        // Style markdown elements for the dark theme
        p: ({ children }) => <p className="mb-2 last:mb-0">{processCitations(children)}</p>,
        strong: ({ children }) => <strong className="font-semibold text-[#F5F5F5]">{children}</strong>,
        ol: ({ children }) => <ol className="list-decimal list-outside ml-4 mb-2 space-y-1">{children}</ol>,
        ul: ({ children }) => <ul className="list-disc list-outside ml-4 mb-2 space-y-1">{children}</ul>,
        li: ({ children }) => <li className="text-sm">{processCitations(children)}</li>,
        h3: ({ children }) => <h3 className="font-semibold text-base mt-3 mb-1">{children}</h3>,
        h4: ({ children }) => <h4 className="font-semibold text-sm mt-2 mb-1">{children}</h4>,
        code: ({ children }) => <code className="font-mono text-accent bg-accent/10 px-1 rounded text-xs">{children}</code>,
      }}
    >
      {processed}
    </ReactMarkdown>
  );

  // Recursively process React children to replace citation placeholders with buttons
  function processCitations(children: React.ReactNode): React.ReactNode {
    if (!children) return children;

    if (typeof children === "string") {
      const parts = children.split(/(%%CITE_\d+%%)/g);
      if (parts.length === 1) return children;
      return parts.map((part, i) => {
        const match = part.match(/^%%CITE_(\d+)%%$/);
        if (match) {
          return <CiteButton key={i} idx={parseInt(match[1], 10)} onCiteClick={onCiteClick} sources={sources} />;
        }
        return <span key={i}>{part}</span>;
      });
    }

    if (Array.isArray(children)) {
      return children.map((child, i) =>
        typeof child === "string" ? processCitations(child) : child
      );
    }

    return children;
  }
}

/**
 * Source detail panel — shows the full source text when a citation is clicked.
 */
function SourcePanel({
  source,
  onClose,
}: {
  source: SourceMeta;
  onClose: () => void;
}) {
  return (
    <div className="mt-3 bg-base rounded-lg p-3 border border-white/5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-sans uppercase tracking-[1px] text-accent">
          Kilde {source.index}
          {source.pageRange && (
            <span className="text-[#666666] ml-2">s. {source.pageRange}</span>
          )}
        </span>
        <button
          onClick={onClose}
          className="text-[#666666] hover:text-[#AAAAAA] transition-colors duration-150"
        >
          <X size={14} />
        </button>
      </div>
      <p className="text-xs text-[#AAAAAA] leading-relaxed whitespace-pre-wrap font-mono">
        {source.content}
      </p>
    </div>
  );
}

export function ChatInterface({
  companyId,
  sessionId,
}: {
  companyId: Id<"companies">;
  sessionId: Id<"chatSessions">;
}) {
  const messages = useQuery(api.chatMessages.listBySession, { sessionId });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sources, setSources] = useState<SourceMeta[]>([]);
  const [activeSource, setActiveSource] = useState<SourceMeta | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming, activeSource]);

  const handleCiteClick = useCallback((source: SourceMeta) => {
    setActiveSource((prev) => (prev?.index === source.index ? null : source));
  }, []);

  // Build sources from saved message data
  const getSourcesForMessage = useCallback((msg: any): SourceMeta[] => {
    if (!msg.sources) return [];
    return msg.sources.map((s: any, i: number) => ({
      index: i + 1,
      chunkId: s.chunkId,
      content: s.content,
      pageRange: s.pageRange,
    }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const question = input.trim();
    setInput("");
    setIsLoading(true);
    setStreaming("");
    setSources([]);
    setActiveSource(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          companyId,
          sessionId,
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            // First event contains source metadata
            if (parsed.sources) {
              setSources(parsed.sources);
            }
            // Subsequent events contain streamed text
            if (parsed.content) {
              setStreaming((prev) => prev + parsed.content);
            }
          } catch {}
        }
      }
    } finally {
      setStreaming("");
      setSources([]);
      setIsLoading(false);
      setActiveSource(null);
    }
  };

  return (
    <div className="flex flex-col h-[600px]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-2">
        {messages?.map((msg) => {
          const msgSources = getSourcesForMessage(msg);
          return (
            <div key={msg._id}>
              <div
                className={`p-4 rounded-card max-w-[85%] ${
                  msg.role === "user"
                    ? "ml-auto bg-accent/10"
                    : "mr-auto bg-elevated shadow-card"
                }`}
              >
                <div className="text-[9px] uppercase tracking-[1px] text-[#666666] mb-1.5 font-sans">
                  {msg.role === "user" ? "Du" : "FinansAnalyse"}
                </div>
                <div className="text-sm leading-relaxed">
                  {msg.role === "assistant" && msgSources.length > 0 ? (
                    <CitedText
                      text={msg.content}
                      sources={msgSources}
                      onCiteClick={handleCiteClick}
                    />
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
              {/* Source panel renders below the message */}
              {activeSource && msg.role === "assistant" && msgSources.some((s) => s.index === activeSource.index) && (
                <div className="max-w-[85%] mr-auto">
                  <SourcePanel source={activeSource} onClose={() => setActiveSource(null)} />
                </div>
              )}
            </div>
          );
        })}

        {/* Streaming message */}
        {streaming && (
          <div>
            <div className="p-4 rounded-card bg-elevated shadow-card mr-auto max-w-[85%]">
              <div className="text-[9px] uppercase tracking-[1px] text-[#666666] mb-1.5 font-sans">
                FinansAnalyse
              </div>
              <div className="text-sm leading-relaxed">
                {sources.length > 0 ? (
                  <>
                    <CitedText
                      text={streaming}
                      sources={sources}
                      onCiteClick={handleCiteClick}
                    />
                    <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 animate-pulse" />
                  </>
                ) : (
                  <>
                    <span className="whitespace-pre-wrap">{streaming}</span>
                    <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 animate-pulse" />
                  </>
                )}
              </div>
            </div>
            {activeSource && (
              <div className="max-w-[85%] mr-auto">
                <SourcePanel source={activeSource} onClose={() => setActiveSource(null)} />
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Still et spørsmål om selskapet..."
          className="flex-1 bg-base rounded-lg px-4 py-3 text-sm shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] placeholder:text-[#666666]"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-4 py-3 bg-accent text-base rounded-lg hover:brightness-90 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <PaperPlaneRight size={18} weight="fill" />
        </button>
      </form>
    </div>
  );
}
