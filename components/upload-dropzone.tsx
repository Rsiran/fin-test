"use client";

import { useState } from "react";
import {
  CloudArrowUp,
  CheckCircle,
  XCircle,
  CircleNotch,
} from "@phosphor-icons/react";
import { useUpload } from "./upload-context";

export function UploadDropzone() {
  const { results, isUploading, handleFiles } = useUpload();
  const [isDragging, setIsDragging] = useState(false);

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
          {results.map((r) => (
            <div
              key={r.id}
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
