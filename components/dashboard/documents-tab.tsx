"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UploadDropzone } from "../upload-dropzone";
import { Trash, Warning } from "@phosphor-icons/react";
import { useState } from "react";

export function DocumentsTab({ companyId }: { companyId: Id<"companies"> }) {
  const company = useQuery(api.companies.get, { id: companyId });
  const documents = useQuery(api.documents.listByCompany, { companyId });
  const removeDocument = useMutation(api.documents.remove);
  const [showDeleteAll, setShowDeleteAll] = useState(false);

  const handleDeleteAll = async () => {
    if (!documents) return;
    for (const doc of documents) {
      await removeDocument({ id: doc._id });
    }
    setShowDeleteAll(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Dokumenter</h2>
        {documents && documents.length > 0 && (
          <button
            onClick={() => setShowDeleteAll(true)}
            className="text-xs text-[#666666] hover:text-negative transition-colors duration-150"
          >
            Slett alle dokumenter
          </button>
        )}
      </div>

      {/* Confirm delete all dialog */}
      {showDeleteAll && (
        <div className="bg-negative/10 border border-negative/20 rounded-card p-4 flex items-start gap-3">
          <Warning size={20} className="text-negative mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-[#F5F5F5]">
              Er du sikker på at du vil slette alle {documents?.length} dokumenter
              for <strong>{company?.name}</strong>? Dette sletter også alle tilhørende
              nøkkeltall og chat-data. Handlingen kan ikke angres.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleDeleteAll}
                className="px-3 py-1.5 text-xs bg-negative text-white rounded-lg hover:brightness-90 transition-all duration-150"
              >
                Ja, slett alt
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

      <UploadDropzone companyId={companyId} />

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
              {documents.map((doc) => (
                <tr
                  key={doc._id}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors duration-150"
                >
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
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => removeDocument({ id: doc._id })}
                      className="text-[#666666] hover:text-negative transition-colors duration-150"
                    >
                      <Trash size={16} />
                    </button>
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
