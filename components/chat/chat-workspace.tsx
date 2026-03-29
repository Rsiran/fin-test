"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Message } from "./message";
import { SourcesPanel } from "./sources-panel";
import { ChatInput } from "./chat-input";
import { SessionsPanel } from "./sessions-panel";
import type { SourceMeta } from "./cited-text";
import type { ChartConfig } from "./inline-chart";
import { ChatCircle, Plus } from "@phosphor-icons/react";

interface ChatWorkspaceProps {
  companyId: Id<"companies">;
  sessionId: Id<"chatSessions">;
  companyName: string;
  sessions: { _id: Id<"chatSessions">; title?: string; createdAt: number }[];
  onSelectSession: (id: Id<"chatSessions">) => void;
  onNewSession: () => void;
}

export function ChatWorkspace({ companyId, sessionId, companyName, sessions, onSelectSession, onNewSession }: ChatWorkspaceProps) {
  const messages = useQuery(api.chatMessages.listBySession, { sessionId });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingSources, setStreamingSources] = useState<SourceMeta[]>([]);
  const [streamingChart, setStreamingChart] = useState<ChartConfig | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<SourceMeta | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clarification, setClarification] = useState<{ question: string; options: string[] } | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [messageCountAtSubmit, setMessageCountAtSubmit] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Clear optimistic message and streaming once Convex has the persisted versions
  useEffect(() => {
    if (!messages?.length) return;
    const last = messages[messages.length - 1];

    // Clear optimistic user message when Convex has it
    if (pendingUserMessage && last.role === "user" && last.content === pendingUserMessage) {
      setPendingUserMessage(null);
    }

    // Clear streaming text when a NEW assistant message appears (message count grew past submit point)
    if (streaming && messageCountAtSubmit !== null && messages.length > messageCountAtSubmit + 1 && last.role === "assistant") {
      setStreaming("");
      setStreamingSources([]);
      setStreamingChart(null);
      setMessageCountAtSubmit(null);
    }
  }, [messages, pendingUserMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming, activeSource, pendingUserMessage]);

  const handleCiteClick = useCallback((source: SourceMeta) => {
    setActiveSource((prev) => (prev?.index === source.index ? null : source));
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
    setMessageCountAtSubmit(messages?.length ?? 0);
    setIsLoading(true);
    setStreaming("");
    setStreamingSources([]);
    setStreamingChart(null);
    setSuggestions([]);
    setClarification(null);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, companyId, sessionId }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        const msg = err?.error || "Noe gikk galt";
        setError(msg);
        return;
      }

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
            if (parsed.suggestions) setSuggestions(parsed.suggestions);
            if (parsed.clarification) setClarification(parsed.clarification);
            if (parsed.content) setStreaming((prev) => prev + parsed.content);
          } catch {}
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOptionClick = (option: string) => {
    setClarification(null);
    setInput(option);
    // Auto-submit after a tick so the input state is set
    setTimeout(() => {
      setInput("");
      setPendingUserMessage(option);
      setMessageCountAtSubmit(messages?.length ?? 0);
      setIsLoading(true);
      setStreaming("");
      setStreamingSources([]);
      setStreamingChart(null);
      setSuggestions([]);
      setClarification(null);
      setError(null);

      fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: option, companyId, sessionId }),
      }).then(async (response) => {
        if (!response.ok) {
          const err = await response.json().catch(() => null);
          setError(err?.error || "Noe gikk galt");
          return;
        }
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
              if (parsed.suggestions) setSuggestions(parsed.suggestions);
              if (parsed.clarification) setClarification(parsed.clarification);
              if (parsed.content) setStreaming((prev) => prev + parsed.content);
            } catch {}
          }
        }
      }).finally(() => {
        setIsLoading(false);
      });
    }, 0);
  };

  const currentSession = sessions.find((s) => s._id === sessionId);

  return (
    <div className="flex h-full relative">
      {/* Sessions panel overlay */}
      {showSessions && (
        <SessionsPanel
          sessions={sessions}
          activeSessionId={sessionId}
          onSelect={(id) => {
            onSelectSession(id);
            setShowSessions(false);
          }}
          onNew={() => {
            onNewSession();
            setShowSessions(false);
          }}
          onClose={() => setShowSessions(false)}
        />
      )}

      {/* Left: Chat pane */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Terminal header */}
        <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center gap-2.5 flex-shrink-0">
          {/* Samtaler button */}
          <button
            onClick={() => setShowSessions(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[#555] hover:text-[#999] hover:bg-white/[0.04] transition-colors"
          >
            <ChatCircle size={14} />
            <span className="text-[10px] font-mono">Samtaler</span>
          </button>

          <span className="text-white/[0.08] text-[11px]">|</span>

          <div className="w-[7px] h-[7px] rounded-full bg-accent" />
          <span className="font-mono text-[11px] tracking-[2px] uppercase text-accent">
            FinansAnalyse
          </span>
          <span className="text-white/[0.15] text-[11px]">/</span>
          <span className="text-[11px] text-[#666] tracking-wide">{companyName}</span>

          {/* Current session name */}
          {currentSession?.title && currentSession.title !== "Ny samtale" && (
            <>
              <span className="text-white/[0.15] text-[11px]">/</span>
              <span className="text-[11px] text-[#555] truncate max-w-[200px]">
                {currentSession.title}
              </span>
            </>
          )}

          {/* New chat button on the right */}
          <div className="flex-1" />
          <button
            onClick={onNewSession}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-[#555] hover:text-accent hover:bg-accent/[0.06] rounded transition-colors"
          >
            <Plus size={12} weight="bold" />
            <span>Ny samtale</span>
          </button>
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
                  <span className="font-mono text-[11px] text-[#555]">Tenker</span>
                  <span className="flex gap-1">
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="self-start animate-fade-in-up">
              <div className="font-mono text-[9px] tracking-[1.5px] uppercase text-negative/60 mb-1">
                Feil
              </div>
              <div className="px-4 py-3 rounded-r-md border-l-2 border-negative/30 bg-negative/[0.05] text-[13px] text-negative/80">
                {error}
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
              isStreaming={!clarification}
            />
          )}

          {/* Clarification options */}
          {clarification && !isLoading && (
            <div className="self-start animate-fade-in-up flex flex-wrap gap-2 ml-1">
              {clarification.options.map((option) => (
                <button
                  key={option}
                  onClick={() => handleOptionClick(option)}
                  className="px-3 py-1.5 text-[12px] bg-accent/[0.06] text-accent border border-accent/[0.2] rounded-md hover:bg-accent/[0.15] hover:border-accent/[0.35] transition-colors cursor-pointer"
                >
                  {option}
                </button>
              ))}
            </div>
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
        source={activeSource}
        onClose={() => setActiveSource(null)}
      />
    </div>
  );
}
