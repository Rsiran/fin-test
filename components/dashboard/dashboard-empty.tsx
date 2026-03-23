"use client";

import Link from "next/link";
import { MagnifyingGlass } from "@phosphor-icons/react";

export function DashboardEmpty() {
  return (
    <div className="text-center py-20">
      <p className="text-lg text-[#666666]">Ingen selskaper lagt til ennå</p>
      <p className="text-sm text-[#666666] mt-1">
        Utforsk databasen for å legge til selskaper
      </p>
      <Link
        href="/browse"
        className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 bg-accent text-base rounded-lg text-sm font-medium hover:brightness-90 transition-all duration-150"
      >
        <MagnifyingGlass size={16} weight="bold" />
        Utforsk selskaper
      </Link>
    </div>
  );
}
