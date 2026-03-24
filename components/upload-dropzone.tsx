"use client";

import { useState, useCallback } from "react";
import { Id } from "@/convex/_generated/dataModel";
import {
  CloudArrowUp,
  CheckCircle,
  XCircle,
  CircleNotch,
} from "@phosphor-icons/react";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

interface UploadResult {
  fileName: string;
  status: "uploading" | "processing" | "ready" | "error";
  progress?: number; // 0-100 for upload phase
  error?: string;
}

function uploadToR2(
  url: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Nettverksfeil under opplasting"));
    xhr.send(file);
  });
}

export function UploadDropzone({
  companyId,
}: {
  companyId: Id<"companies">;
}) {
  const [results, setResults] = useState<UploadResult[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const updateResult = useCallback(
    (fileName: string, update: Partial<UploadResult>) => {
      setResults((prev) =>
        prev.map((r) => (r.fileName === fileName ? { ...r, ...update } : r))
      );
    },
    []
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const pdfFiles = Array.from(files).filter(
        (f) => f.type === "application/pdf"
      );
      if (pdfFiles.length === 0) return;

      setIsUploading(true);
      setResults(
        pdfFiles.map((f) => {
          if (f.size > MAX_FILE_SIZE) {
            return {
              fileName: f.name,
              status: "error" as const,
              error: "Filen er for stor (maks 100 MB)",
            };
          }
          return { fileName: f.name, status: "uploading" as const, progress: 0 };
        })
      );

      for (const file of pdfFiles) {
        if (file.size > MAX_FILE_SIZE) continue;

        try {
          // 1. Get presigned URL
          const presignRes = await fetch("/api/upload/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId,
              fileName: file.name,
              fileSize: file.size,
            }),
          });
          if (!presignRes.ok) {
            const err = await presignRes.json();
            throw new Error(err.error || "Kunne ikke starte opplasting");
          }
          const { uploadUrl, docId } = await presignRes.json();

          // 2. Upload directly to R2
          await uploadToR2(uploadUrl, file, (pct) => {
            updateResult(file.name, { progress: pct });
          });

          // 3. Trigger processing
          updateResult(file.name, { status: "processing" });
          const processRes = await fetch("/api/upload/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ docId }),
          });
          const processData = await processRes.json();

          if (processData.status === "ready") {
            updateResult(file.name, { status: "ready" });
          } else {
            updateResult(file.name, {
              status: "error",
              error: processData.error || "Prosessering feilet",
            });
          }
        } catch (error) {
          updateResult(file.name, {
            status: "error",
            error:
              error instanceof Error
                ? error.message
                : "Opplasting feilet",
          });
        }
      }

      setIsUploading(false);
    },
    [companyId, updateResult]
  );

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
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
                <CheckCircle
                  size={18}
                  weight="fill"
                  className="text-positive"
                />
              ) : r.status === "error" ? (
                <XCircle size={18} weight="fill" className="text-negative" />
              ) : (
                <CircleNotch
                  size={18}
                  className="text-warning animate-spin"
                />
              )}
              <span className="text-sm font-sans">{r.fileName}</span>
              {r.status === "uploading" && r.progress !== undefined && (
                <span className="text-xs text-[#AAAAAA] ml-auto">
                  {r.progress}%
                </span>
              )}
              {r.status === "processing" && (
                <span className="text-xs text-[#AAAAAA] ml-auto">
                  Prosesserer...
                </span>
              )}
              {r.error && (
                <span className="text-xs text-negative ml-auto">
                  {r.error}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
