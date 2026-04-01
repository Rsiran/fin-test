"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UploadDropzone } from "../upload-dropzone";
import { DownloadSimple, Trash, Warning } from "@phosphor-icons/react";
import { useState, useCallback } from "react";
import { useReportFilter } from "./report-filter-context";
import JSZip from "jszip";

export function DocumentsTab({ companyId }: { companyId: Id<"companies"> }) {
  const company = useQuery(api.companies.get, { id: companyId });
  const { allDocuments: documents } = useReportFilter();
  const removeDocument = useMutation(api.documents.remove);
  const currentUserId = useQuery(api.users.me);
  const currentUser = useQuery(api.users.meProfile);
  const isAdmin = currentUser?.email === "s2419213@bi.no";
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);

  const myDocuments = isAdmin
    ? documents
    : documents?.filter((d: { uploadedBy?: string }) => d.uploadedBy === currentUserId);

  const handleDeleteAll = async () => {
    if (!myDocuments) return;
    for (const doc of myDocuments) {
      await removeDocument({ id: doc._id });
    }
    setShowDeleteAll(false);
  };

  const downloadableDocs = documents?.filter(
    (doc: { markdownUrl?: string | null }) => doc.markdownUrl
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (!downloadableDocs) return;
    const allSelected = downloadableDocs.every((d: { _id: string }) =>
      selectedIds.has(d._id)
    );
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(downloadableDocs.map((d: { _id: string }) => d._id)));
    }
  }, [downloadableDocs, selectedIds]);

  const handleBulkDownload = async () => {
    if (!documents || selectedIds.size === 0) return;
    setIsDownloading(true);
    try {
      const selected = documents.filter(
        (doc: { _id: string; markdownUrl?: string | null }) =>
          selectedIds.has(doc._id) && doc.markdownUrl
      );
      const zip = new JSZip();
      for (const doc of selected) {
        const res = await fetch(doc.markdownUrl!);
        const text = await res.text();
        zip.file(doc.fileName.replace(/\.pdf$/i, ".md"), text);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dokumenter-${selected.length}-filer.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Dokumenter</h2>
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDownload}
              disabled={isDownloading}
              className="flex items-center gap-1.5 text-xs text-accent hover:brightness-110 transition-all duration-150 disabled:opacity-50"
            >
              <DownloadSimple size={14} />
              {isDownloading
                ? "Laster ned..."
                : `Last ned markdown (${selectedIds.size})`}
            </button>
          )}
          {myDocuments && myDocuments.length > 0 && (
            <button
              onClick={() => setShowDeleteAll(true)}
              className="text-xs text-[#666666] hover:text-negative transition-colors duration-150"
            >
              Slett mine dokumenter
            </button>
          )}
        </div>
      </div>

      {/* Confirm delete all dialog */}
      {showDeleteAll && (
        <div className="bg-negative/10 border border-negative/20 rounded-card p-4 flex items-start gap-3">
          <Warning size={20} className="text-negative mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-[#F5F5F5]">
              Er du sikker på at du vil slette dine {myDocuments?.length} dokumenter
              for <strong>{company?.name}</strong>? Dette sletter også alle tilhørende
              nøkkeltall og chat-data. Handlingen kan ikke angres.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleDeleteAll}
                className="px-3 py-1.5 text-xs bg-negative text-white rounded-lg hover:brightness-90 transition-all duration-150"
              >
                Ja, slett mine dokumenter
              </button>
              <button
                onClick={() => setShowDeleteAll(false)}
                className="px-3 py-1.5 text-xs text-[#AAAAAA] border border-white/10 rounded-lg hover:text-[#F5F5F5] transition-all duration-150"
              >
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Company name indicator so user knows where they're uploading */}
      <div className="text-[9px] font-sans uppercase tracking-[1px] text-[#666666]">
        Laster opp til: <span className="text-accent">{company?.name ?? "..."}</span>
      </div>

      <UploadDropzone />

      {documents === undefined ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-12" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <p className="text-sm text-[#666666]">Ingen dokumenter lastet opp ennå</p>
      ) : (
        <div className="bg-elevated rounded-card shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="py-3 px-4 w-10">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center justify-center"
                    title="Velg alle"
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors duration-150 ${
                        !!downloadableDocs?.length &&
                        downloadableDocs.every((d: { _id: string }) =>
                          selectedIds.has(d._id)
                        )
                          ? "bg-accent border-accent"
                          : selectedIds.size > 0
                          ? "border-accent bg-accent/20"
                          : "border-white/20 bg-transparent"
                      }`}
                    >
                      {!!downloadableDocs?.length &&
                      downloadableDocs.every((d: { _id: string }) =>
                        selectedIds.has(d._id)
                      ) ? (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : selectedIds.size > 0 ? (
                        <span className="w-2 h-0.5 bg-accent rounded-full" />
                      ) : null}
                    </span>
                  </button>
                </th>
                <th className="text-left py-3 px-4 text-[9px] uppercase tracking-[1px] text-[#666666] font-sans">
                  Filnavn
                </th>
                <th className="text-left py-3 px-4 text-[9px] uppercase tracking-[1px] text-[#666666] font-sans">
                  Type
                </th>
                <th className="text-left py-3 px-4 text-[9px] uppercase tracking-[1px] text-[#666666] font-sans">
                  Periode
                </th>
                <th className="text-left py-3 px-4 text-[9px] uppercase tracking-[1px] text-[#666666] font-sans">
                  Status
                </th>
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody>
              {documents.map((doc: { _id: Id<"documents">; fileName: string; reportType: string; period: string; status: string; uploadedBy?: string; markdownUrl?: string | null }) => (
                <tr
                  key={doc._id}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors duration-150"
                >
                  <td className="py-3 px-4 w-10">
                    {doc.markdownUrl && (
                      <button
                        onClick={() => toggleSelect(doc._id)}
                        className="flex items-center justify-center"
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors duration-150 ${
                            selectedIds.has(doc._id)
                              ? "bg-accent border-accent"
                              : "border-white/20 bg-transparent hover:border-white/40"
                          }`}
                        >
                          {selectedIds.has(doc._id) && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                      </button>
                    )}
                  </td>
                  <td className="py-3 px-4 font-sans text-sm">{doc.fileName}</td>
                  <td className="py-3 px-4">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-accent-subtle text-accent font-mono">
                      {doc.reportType}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-[#666666]">
                    {doc.period}
                  </td>
                  <td className="py-3 px-4">
                    <span className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            doc.status === "ready"
                              ? "bg-accent"
                              : doc.status === "error"
                              ? "bg-negative"
                              : "bg-warning"
                          }`}
                        />
                        <span className="text-xs text-[#AAAAAA]">
                          {doc.status === "ready"
                            ? "Klar"
                            : doc.status === "error"
                            ? "Feil"
                            : "Prosesserer..."}
                        </span>
                      </span>
                      {doc.markdownUrl && (
                        <button
                          onClick={async () => {
                            const res = await fetch(doc.markdownUrl!);
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = doc.fileName.replace(/\.pdf$/i, ".md");
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="text-[#666666] hover:text-accent transition-colors duration-150"
                          title="Last ned markdown"
                        >
                          <DownloadSimple size={16} />
                        </button>
                      )}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {(isAdmin || doc.uploadedBy === currentUserId) && (
                      <button
                        onClick={() => removeDocument({ id: doc._id })}
                        className="text-[#666666] hover:text-negative transition-colors duration-150"
                      >
                        <Trash size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
