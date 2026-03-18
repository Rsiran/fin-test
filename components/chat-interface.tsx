"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { PaperPlaneRight } from "@phosphor-icons/react";

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const question = input.trim();
    setInput("");
    setIsLoading(true);
    setStreaming("");

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
            setStreaming((prev) => prev + parsed.content);
          } catch {}
        }
      }
    } finally {
      setStreaming("");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px]">
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-2">
        {messages?.map((msg) => (
          <div
            key={msg._id}
            className={`p-4 rounded-card max-w-[85%] ${
              msg.role === "user"
                ? "ml-auto bg-accent/10"
                : "mr-auto bg-elevated shadow-card"
            }`}
          >
            <div className="text-[9px] uppercase tracking-[1px] text-[#666666] mb-1.5 font-sans">
              {msg.role === "user" ? "Du" : "FinansAnalyse"}
            </div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {msg.content}
            </div>
            {msg.sources && msg.sources.length > 0 && (
              <div className="mt-3 flex gap-1.5 flex-wrap">
                {msg.sources.map((s, i) => (
                  <span
                    key={i}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent-subtle text-accent cursor-pointer hover:bg-accent-muted transition-colors duration-150"
                  >
                    {s.pageRange ? `s. ${s.pageRange}` : `kilde ${i + 1}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {streaming && (
          <div className="p-4 rounded-card bg-elevated shadow-card mr-auto max-w-[85%]">
            <div className="text-[9px] uppercase tracking-[1px] text-[#666666] mb-1.5 font-sans">
              FinansAnalyse
            </div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {streaming}
              <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 animate-pulse" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Still et sporsmal om selskapet..."
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
