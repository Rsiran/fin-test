"use client";

import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

interface MarginsChartProps {
  data: {
    period: string;
    driftsmargin?: number;
    ebitda_margin?: number;
    netto_margin?: number;
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

export function MarginsChart({ data }: MarginsChartProps) {
  return (
    <div className="bg-elevated rounded-card shadow-card p-5">
      <h3 className="text-[9px] font-sans uppercase tracking-[1px] text-[#666666] mb-4">
        Marginer (%)
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#666666", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#666666", fontFamily: "var(--font-mono)" }} unit="%" axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px", color: "#AAAAAA" }} />
          <Line type="monotone" dataKey="driftsmargin" name="Driftsmargin" stroke="#5eead4" strokeWidth={2} dot={false} animationDuration={500} />
          <Line type="monotone" dataKey="ebitda_margin" name="EBITDA" stroke="#14b8a6" strokeWidth={1.5} dot={false} animationDuration={500} />
          <Line type="monotone" dataKey="netto_margin" name="Netto" stroke="#1a8a7d" strokeWidth={1.5} dot={false} animationDuration={500} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
