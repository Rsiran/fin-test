"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

interface CashflowChartProps {
  data: {
    period: string;
    operasjonell?: number;
    investering?: number;
    finansiering?: number;
    fcf?: number;
  }[];
}

const GRID_STROKE = "rgba(255,255,255,0.06)";
const TOOLTIP_STYLE = {
  backgroundColor: "#232323",
  border: "none",
  borderRadius: "8px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
  color: "#F5F5F5",
  fontSize: "12px",
};

export function CashflowChart({ data }: CashflowChartProps) {
  return (
    <div className="bg-elevated rounded-card shadow-card p-5">
      <h3 className="text-[9px] font-sans uppercase tracking-[1px] text-[#666666] mb-4">
        Kontantstrøm (MNOK)
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#666666", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#666666", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px", color: "#AAAAAA" }} />
          <Bar dataKey="operasjonell" name="Operasjonell" fill="#2DD4BF" radius={[2, 2, 0, 0]} animationDuration={300} />
          <Bar dataKey="investering" name="Investering" fill="#f87171" radius={[2, 2, 0, 0]} animationDuration={300} />
          <Bar dataKey="finansiering" name="Finansiering" fill="#6b7280" radius={[2, 2, 0, 0]} animationDuration={300} />
          <Bar dataKey="fcf" name="FCF" fill="#14b8a6" radius={[2, 2, 0, 0]} animationDuration={300} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
