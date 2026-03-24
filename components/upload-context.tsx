"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { Id } from "@/convex/_generated/dataModel";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export interface UploadResult {
  id: string;
  fileName: string;
  status: "uploading" | "processing" | "ready" | "error";
  progress?: number;
  error?: string;
}

let uploadCounter = 0;

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

interface UploadContextValue {
  results: UploadResult[];
  isUploading: boolean;
  handleFiles: (files: FileList | File[]) => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({
  companyId,
  children,
}: {
  companyId: Id<"companies">;
  children: ReactNode;
}) {
  const [results, setResults] = useState<UploadResult[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const updateResult = useCallback(
    (id: string, update: Partial<UploadResult>) => {
      setResults((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...update } : r))
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
      const fileEntries = pdfFiles.map((f) => {
        const id = String(++uploadCounter);
        if (f.size > MAX_FILE_SIZE) {
          return {
            id,
            file: f,
            result: {
              id,
              fileName: f.name,
              status: "error" as const,
              error: "Filen er for stor (maks 100 MB)",
            },
            skip: true,
          };
        }
        return {
          id,
          file: f,
          result: { id, fileName: f.name, status: "uploading" as const, progress: 0 },
          skip: false,
        };
      });
      setResults((prev) => [...prev, ...fileEntries.map((e) => e.result)]);

      for (const { id, file, skip } of fileEntries) {
        if (skip) continue;

        try {
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

          await uploadToR2(uploadUrl, file, (pct) => {
            updateResult(id, { progress: pct });
          });

          updateResult(id, { status: "processing" });
          const processRes = await fetch("/api/upload/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ docId }),
          });
          const processData = await processRes.json();

          if (processData.status === "ready") {
            updateResult(id, { status: "ready" });
          } else {
            updateResult(id, {
              status: "error",
              error: processData.error || "Prosessering feilet",
            });
          }
        } catch (error) {
          updateResult(id, {
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
    <UploadContext.Provider value={{ results, isUploading, handleFiles }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used within UploadProvider");
  return ctx;
}
