"use client";

import ReactMarkdown from "react-markdown";

interface SourceMeta {
  index: number;
  chunkId: string;
  content: string;
  pageRange?: string;
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
  const segments = text.split(/(\[(?:Kilde\s*)?\d+\])/g);

  return (
    <div className="cited-text">
      {segments.map((segment, i) => {
        const citeMatch = segment.match(/^\[(?:Kilde\s*)?(\d+)\]$/);
        if (citeMatch) {
          const idx = parseInt(citeMatch[1], 10);
          const source = sources.find((s) => s.index === idx);
          if (source) {
            return (
              <button
                key={i}
                onClick={() => onCiteClick(source)}
                className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-mono font-bold bg-accent/[0.18] text-accent rounded-[3px] hover:bg-accent/[0.35] transition-colors duration-150 mx-0.5 align-middle cursor-pointer"
                title={`Kilde ${idx}`}
              >
                {idx}
              </button>
            );
          }
          return <span key={i}>[{idx}]</span>;
        }

        if (!segment.trim()) return null;
        return (
          <ReactMarkdown
            key={i}
            components={{
              p: ({ children }) => <span className="inline">{children} </span>,
              strong: ({ children }) => (
                <strong className="font-semibold text-[#e8e8e8]">{children}</strong>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-outside ml-4 mb-2 space-y-1">{children}</ol>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-outside ml-4 mb-2 space-y-1">{children}</ul>
              ),
              li: ({ children }) => <li className="text-sm">{children}</li>,
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
            {segment}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}

export type { SourceMeta };
