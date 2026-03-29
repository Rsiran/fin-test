"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import { DocumentsTab } from "./documents-tab";
import { OverviewTab } from "./overview-tab";
import { ChatTab } from "./chat-tab";
import { UploadProvider } from "../upload-context";
import { ChartBar, FileText, ChatCircle } from "@phosphor-icons/react";
import { ReportFilterBar } from "./report-filter-bar";

const TABS = [
  { id: "oversikt", label: "Oversikt", icon: ChartBar },
  { id: "dokumenter", label: "Dokumenter", icon: FileText },
  { id: "chat", label: "Chat", icon: ChatCircle },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function DashboardTabs({ companyId, companyName }: { companyId: Id<"companies">; companyName: string }) {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabId) || "oversikt";
  const [activeTab, setActiveTab] = useState<TabId>(
    TABS.some((t) => t.id === initialTab) ? initialTab : "oversikt"
  );

  return (
    <div className={activeTab === "chat" ? "flex flex-col h-[calc(100vh-57px)] overflow-hidden" : ""}>
      <div className="border-b border-white/5 flex flex-shrink-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium transition-colors duration-150 flex items-center gap-2 ${
                isActive
                  ? "border-b-2 border-accent text-accent"
                  : "text-[#666666] hover:text-[#AAAAAA]"
              }`}
            >
              <Icon
                size={18}
                weight={isActive ? "fill" : "light"}
                className="sm:hidden"
              />
              <Icon
                size={16}
                weight={isActive ? "fill" : "light"}
                className="hidden sm:block"
              />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "oversikt" && <ReportFilterBar />}
      <UploadProvider companyId={companyId}>
        {activeTab === "chat" ? (
          <div className="flex-1 min-h-0">
            <ChatTab companyId={companyId} companyName={companyName} />
          </div>
        ) : (
          <div className="p-8 max-w-7xl mx-auto">
            {activeTab === "oversikt" && <OverviewTab companyId={companyId} />}
            {activeTab === "dokumenter" && <DocumentsTab companyId={companyId} />}
          </div>
        )}
      </UploadProvider>
    </div>
  );
}
