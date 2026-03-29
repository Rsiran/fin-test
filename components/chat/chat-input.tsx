"use client";

import { useRef, useCallback } from "react";
import { PaperPlaneRight } from "@phosphor-icons/react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  suggestions?: string[];
}

export function ChatInput({ value, onChange, onSubmit, disabled, suggestions }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) onSubmit();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion);
    textareaRef.current?.focus();
  };

  return (
    <div className="px-5 py-4 border-t border-white/[0.06]">
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Still et spørsmål om selskapet..."
          disabled={disabled}
          rows={1}
          className="flex-1 px-3.5 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-md text-[13px] text-[#ccc] placeholder:text-[#444] resize-none outline-none overflow-hidden focus:border-accent/[0.3] transition-colors disabled:opacity-40"
        />
        <button
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className="w-9 h-9 flex items-center justify-center bg-accent/[0.12] border border-accent/[0.2] rounded-md text-accent hover:bg-accent/[0.2] hover:border-accent/[0.35] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <PaperPlaneRight size={16} weight="fill" />
        </button>
      </div>

      {suggestions && suggestions.length > 0 && !value && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestionClick(s)}
              className="text-[11px] px-2.5 py-1 bg-white/[0.03] border border-white/[0.06] rounded text-[#555] hover:bg-white/[0.05] hover:text-[#888] hover:border-white/[0.1] transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
