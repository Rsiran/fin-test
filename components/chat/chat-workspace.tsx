"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Message } from "./message";
import { SourcesPanel } from "./sources-panel";
import { ChatInput } from "./chat-input";
import type { SourceMeta } from "./cited-text";
import type { ChartConfig } from "./inline-chart";

interface ChatWorkspaceProps {
  companyId: Id<"companies">;
  sessionId: Id<"chatSessions">;
  companyName: string;
}

export function ChatWorkspace({ companyId, sessionId, companyName }: ChatWorkspaceProps) {
  const messages = useQuery(api.chatMessages.listBySession, { sessionId });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingSources, setStreamingSources] = useState<SourceMeta[]>([]);
  const [streamingChart, setStreamingChart] = useState<ChartConfig | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [activeSourceIndex, setActiveSourceIndex] = useState<number | null>(null);
  const [allSources, setAllSources] = useState<SourceMeta[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming, activeSourceIndex]);

  // Collect all sources from all assistant messages + streaming
  useEffect(() => {
    const collected: SourceMeta[] = [];
    if (messages) {
      for (const msg of messages) {
        if (msg.role === "assistant" && msg.sources) {
          msg.sources.forEach((s: { chunkId: string; content: string; pageRange?: string }) => {
            if (!collected.find((c) => c.chunkId === s.chunkId)) {
              collected.push({
                index: collected.length + 1,
                chunkId: s.chunkId,
                content: s.content,
                pageRange: s.pageRange,
              });
            }
          });
        }
      }
    }
    for (const s of streamingSources) {
      if (!collected.find((c) => c.chunkId === s.chunkId)) {
        collected.push({ ...s, index: collected.length + 1 });
      }
    }
    setAllSources(collected);
  }, [messages, streamingSources]);

  const handleCiteClick = useCallback((source: SourceMeta) => {
    setActiveSourceIndex((prev) => (prev === source.index ? null : source.index));
  }, []);

  const getSourcesForMessage = useCallback(
    (msg: { sources?: { chunkId: string; content: string; pageRange?: string }[] }): SourceMeta[] => {
      if (!msg.sources) return [];
      return msg.sources.map((s, i) => ({
        index: i + 1,
        chunkId: s.chunkId,
        content: s.content,
        pageRange: s.pageRange,
      }));
    },
    []
  );

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return;

    const question = input.trim();
    setInput("");
    setPendingUserMessage(question);
    setIsLoading(true);
    setStreaming("");
    setStreamingSources([]);
    setStreamingChart(null);
    setActiveSourceIndex(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, companyId, sessionId }),
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
            if (parsed.sources) setStreamingSources(parsed.sources);
            if (parsed.chart) setStreamingChart(parsed.chart);
            if (parsed.content) setStreaming((prev) => prev + parsed.content);
          } catch {}
        }
      }
    } finally {
      setStreaming("");
      setStreamingSources([]);
      setStreamingChart(null);
      setPendingUserMessage(null);
      setIsLoading(false);
      setActiveSourceIndex(null);
    }
  };

  const suggestions = [
    "Sammenlign med forrige kvartal",
    "Vis inntektsutvikling som graf",
    "Analyser gjeldssituasjonen",
  ];

  return (
    <div className="flex h-[calc(100vh-110px)]">
      {/* Left: Chat pane */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Terminal header */}
        <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center gap-2.5">
          <div className="w-[7px] h-[7px] rounded-full bg-accent" />
          <span className="font-mono text-[11px] tracking-[2px] uppercase text-accent">
            FinansAnalyse
          </span>
          <span className="text-white/[0.15] text-[11px]">/</span>
          <span className="text-[11px] text-[#666] tracking-wide">{companyName}</span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {messages?.map((msg: { _id: string; role: string; content: string; sources?: { chunkId: string; content: string; pageRange?: string }[]; chart?: ChartConfig }) => (
            <Message
              key={msg._id}
              role={msg.role as "user" | "assistant"}
              content={msg.content}
              sources={getSourcesForMessage(msg)}
              chart={msg.chart}
              onCiteClick={handleCiteClick}
            />
          ))}

          {/* Optimistic user message — shows immediately before server roundtrip */}
          {pendingUserMessage && (
            <Message role="user" content={pendingUserMessage} />
          )}

          {/* Thinking indicator — waiting for first token */}
          {isLoading && !streaming && (
            <div className="self-start animate-fade-in-up">
              <div className="font-mono text-[9px] tracking-[1.5px] uppercase text-[#555] mb-1">
                Analyse
              </div>
              <div className="px-4 py-3 rounded-r-md border-l-2 border-white/[0.08] bg-white/[0.025]">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-[#555]">Analyserer</span>
                  <span className="flex gap-1">
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Streaming message */}
          {streaming && (
            <Message
              role="assistant"
              content={streaming}
              sources={streamingSources}
              chart={streamingChart ?? undefined}
              onCiteClick={handleCiteClick}
              isStreaming
            />
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={isLoading}
          suggestions={suggestions}
        />
      </div>

      {/* Right: Sources pane */}
      <SourcesPanel
        sources={allSources}
        activeSourceIndex={activeSourceIndex}
        onSourceClick={handleCiteClick}
      />
    </div>
  );
}
