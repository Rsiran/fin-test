"use client";

import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
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
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const createDocument = useMutation(api.documents.create);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const pdfFiles = Array.from(files).filter(
      (f) => f.type === "application/pdf"
    );
    if (pdfFiles.length === 0) return;

    setIsUploading(true);
    setResults(pdfFiles.map((f) => ({ fileName: f.name, status: "uploading" })));

    // Phase 1: Upload all PDFs directly to Convex storage and create document records
    const uploaded: { docId: Id<"documents">; fileName: string }[] = [];

    for (const file of pdfFiles) {
      try {
        const uploadUrl = await generateUploadUrl();
        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = await uploadResponse.json();

        const docId = await createDocument({
          companyId,
          fileName: file.name,
          fileId: storageId,
          reportType: "annet",
          period: "unknown",
        });

        uploaded.push({ docId, fileName: file.name });
      } catch {
        setResults((prev) =>
          prev.map((r) =>
            r.fileName === file.name
              ? { ...r, status: "error", error: "Opplasting feilet" }
              : r
          )
        );
      }
    }

    if (uploaded.length === 0) {
      setIsUploading(false);
      return;
    }

    // Phase 2: Trigger server-side processing with just document IDs (tiny payload)
    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documents: uploaded.map((u) => ({ docId: u.docId })),
        }),
      });
      const data = await response.json();

      setResults(
        uploaded.map((u) => {
          const result = data.results?.find((r: { docId: string }) => r.docId === u.docId);
          return {
            fileName: u.fileName,
            status: result?.status ?? "error",
            error: result?.error,
          };
        })
      );
    } catch {
      setResults(uploaded.map((u) => ({
        fileName: u.fileName,
        status: "error",
        error: "Prosessering feilet",
      })));
    } finally {
      setIsUploading(false);
    }
  }, [companyId, generateUploadUrl, createDocument]);

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
