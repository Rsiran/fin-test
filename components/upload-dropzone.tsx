"use client";

import { useState, useCallback } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { CloudArrowUp, CheckCircle, XCircle, CircleNotch } from "@phosphor-icons/react";

interface UploadResult {
  fileName: string;
  status: "uploading" | "ready" | "error";
  error?: string;
}

export function UploadDropzone({ companyId }: { companyId: Id<"companies"> }) {
  const [results, setResults] = useState<UploadResult[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const pdfFiles = Array.from(files).filter(
      (f) => f.type === "application/pdf"
    );
    if (pdfFiles.length === 0) return;

    setIsUploading(true);
    setResults(pdfFiles.map((f) => ({ fileName: f.name, status: "uploading" })));

    const formData = new FormData();
    formData.append("companyId", companyId);
    for (const file of pdfFiles) {
      formData.append("files", file);
    }

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      setResults(
        data.results.map((r: any) => ({
          fileName: r.fileName,
          status: r.status,
          error: r.error,
        }))
      );
    } catch {
      setResults(pdfFiles.map((f) => ({
        fileName: f.name,
        status: "error",
        error: "Opplasting feilet",
      })));
    } finally {
      setIsUploading(false);
    }
  }, [companyId]);

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`border border-dashed rounded-card p-8 text-center transition-all duration-150 ${
          isDragging
            ? "border-accent bg-accent-subtle/20"
            : "border-white/10 hover:border-white/20"
        }`}
      >
        <CloudArrowUp
          size={32}
          weight={isDragging ? "fill" : "light"}
          className={`mx-auto mb-3 ${isDragging ? "text-accent" : "text-[#666666]"}`}
        />
        <p className="text-sm text-[#AAAAAA]">
          {isUploading ? "Prosesserer..." : "Dra og slipp PDF-filer her"}
        </p>
        <p className="text-xs text-[#666666] mt-1">eller</p>
        <label className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm bg-accent text-base rounded-lg cursor-pointer hover:brightness-90 transition-all duration-150 font-medium">
          Velg filer
          <input
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </label>
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-card bg-elevated"
            >
              {r.status === "ready" ? (
                <CheckCircle size={18} weight="fill" className="text-positive" />
              ) : r.status === "error" ? (
                <XCircle size={18} weight="fill" className="text-negative" />
              ) : (
                <CircleNotch size={18} className="text-warning animate-spin" />
              )}
              <span className="text-sm font-sans">{r.fileName}</span>
              {r.error && (
                <span className="text-xs text-negative ml-auto">{r.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
