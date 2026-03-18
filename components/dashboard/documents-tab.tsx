"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UploadDropzone } from "../upload-dropzone";
import { Trash } from "@phosphor-icons/react";

export function DocumentsTab({ companyId }: { companyId: Id<"companies"> }) {
  const documents = useQuery(api.documents.listByCompany, { companyId });
  const removeDocument = useMutation(api.documents.remove);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Dokumenter</h2>

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
