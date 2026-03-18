"use client";

import { useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

interface RevenueChartProps {
  data: { period: string; value: number }[];
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

export function RevenueChart({ data }: RevenueChartProps) {
  const [chartType, setChartType] = useState<"bar" | "line">("bar");

  return (
    <div className="bg-elevated rounded-card shadow-card p-5">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-[9px] font-sans uppercase tracking-[1px] text-[#666666]">
          Driftsinntekter (MNOK)
        </h3>
        <div className="flex gap-1">
          {(["bar", "line"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setChartType(type)}
              className={`px-2.5 py-1 text-[11px] rounded transition-colors duration-150 ${
                chartType === type
                  ? "bg-accent/15 text-accent"
                  : "text-[#666666] hover:text-[#AAAAAA]"
              }`}
            >
              {type === "bar" ? "Søyle" : "Linje"}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        {chartType === "bar" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#666666", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#666666", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar dataKey="value" fill="#2DD4BF" radius={[2, 2, 0, 0]} animationDuration={300} animationEasing="ease-out" />
          </BarChart>
        ) : (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#666666", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#666666", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Line type="monotone" dataKey="value" stroke="#2DD4BF" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#2DD4BF" }} animationDuration={500} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
