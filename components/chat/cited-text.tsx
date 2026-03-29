"use client";

import React from "react";
import ReactMarkdown from "react-markdown";

interface SourceMeta {
  index: number;
  chunkId: string;
  content: string;
  pageRange?: string;
}

/**
 * Inject citation buttons into a plain text string.
 * Splits on [N] or [Kilde N] and returns an array of text + buttons.
 */
function injectCitations(
  text: string,
  sources: SourceMeta[],
  onCiteClick: (source: SourceMeta) => void
): React.ReactNode[] {
  const parts = text.split(/(\[(?:Kilde\s*)?\d+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[(?:Kilde\s*)?(\d+)\]$/);
    if (match) {
      const idx = parseInt(match[1], 10);
      const source = sources.find((s) => s.index === idx);
      if (source) {
        return (
          <button
            key={`cite-${i}`}
            onClick={() => onCiteClick(source)}
            className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-mono font-bold bg-accent/[0.18] text-accent rounded-[3px] hover:bg-accent/[0.35] transition-colors duration-150 mx-0.5 align-middle cursor-pointer"
            title={`Kilde ${idx}`}
          >
            {idx}
          </button>
        );
      }
      return <span key={`cite-${i}`}>[{idx}]</span>;
    }
    return part || null;
  });
}

/**
 * Recursively walk React children and replace citation patterns in text nodes.
 */
function processCitations(
  children: React.ReactNode,
  sources: SourceMeta[],
  onCiteClick: (source: SourceMeta) => void
): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") {
      if (/\[(?:Kilde\s*)?\d+\]/.test(child)) {
        return <>{injectCitations(child, sources, onCiteClick)}</>;
      }
      return child;
    }
    if (React.isValidElement<{ children?: React.ReactNode }>(child) && child.props.children) {
      return React.cloneElement(child, {
        children: processCitations(child.props.children, sources, onCiteClick),
      } as Partial<{ children: React.ReactNode }>);
    }
    return child;
  });
}

export function CitedText({
  text,
  sources,
  onCiteClick,
}: {
  text: string;
  sources: SourceMeta[];
  onCiteClick: (source: SourceMeta) => void;
}) {
  return (
    <div className="cited-text">
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <p className="mb-2 last:mb-0">
              {processCitations(children, sources, onCiteClick)}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-[#e8e8e8]">{children}</strong>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside ml-4 mb-2 space-y-1">{children}</ol>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-outside ml-4 mb-2 space-y-1">{children}</ul>
          ),
          li: ({ children }) => (
            <li className="text-sm">
              {processCitations(children, sources, onCiteClick)}
            </li>
          ),
          h3: ({ children }) => (
            <h3 className="font-semibold text-base mt-3 mb-1">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="font-semibold text-sm mt-2 mb-1">{children}</h4>
          ),
          code: ({ children }) => (
            <code className="font-mono text-accent bg-accent/10 px-1 rounded text-xs">
              {children}
            </code>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export type { SourceMeta };
