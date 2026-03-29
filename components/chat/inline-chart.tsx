"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface ChartConfig {
  type: "bar" | "line";
  title: string;
  labels: string[];
  datasets: { label: string; values: number[] }[];
  unit?: string;
}

function ChartTooltipContent({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-elevated border border-white/10 rounded-md px-3 py-2 shadow-card text-xs">
      <p className="font-mono text-[#999] mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-accent font-mono font-semibold">
          {entry.value.toLocaleString("nb-NO")} {unit || ""}
        </p>
      ))}
    </div>
  );
}

export function InlineChart({ config }: { config: ChartConfig }) {
  const [showTable, setShowTable] = useState(false);

  const data = config.labels.map((label, i) => {
    const point: Record<string, string | number> = { name: label };
    config.datasets.forEach((ds) => {
      point[ds.label] = ds.values[i] ?? 0;
    });
    return point;
  });

  const handleExport = () => {
    const header = ["", ...config.labels].join(",");
    const rows = config.datasets.map(
      (ds) => [ds.label, ...ds.values.map((v) => v.toString())].join(",")
    );
    const csv = [header, ...rows].join("\n");
    navigator.clipboard.writeText(csv).catch(() => {});
  };

  return (
    <div className="my-3 bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-white/[0.04]">
        <span className="text-[11px] font-semibold text-[#999]">{config.title}</span>
        <div className="flex gap-1.5">
          <button
            onClick={() => setShowTable((v) => !v)}
            className="font-mono text-[9px] px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded text-[#555] hover:bg-white/[0.08] hover:text-[#888] transition-colors"
          >
            {showTable ? "Graf" : "Tabell"}
          </button>
          <button
            onClick={handleExport}
            className="font-mono text-[9px] px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded text-[#555] hover:bg-white/[0.08] hover:text-[#888] transition-colors"
          >
            Eksporter
          </button>
        </div>
      </div>

      {/* Chart or Table */}
      {showTable ? (
        <div className="p-3.5 overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left py-1.5 text-[#555] font-normal"></th>
                {config.labels.map((l) => (
                  <th key={l} className="text-right py-1.5 text-[#555] font-normal px-2">
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.datasets.map((ds) => (
                <tr key={ds.label} className="border-b border-white/[0.03]">
                  <td className="py-1.5 text-[#888]">{ds.label}</td>
                  {ds.values.map((v, i) => (
                    <td key={i} className="text-right py-1.5 text-accent px-2">
                      {v.toLocaleString("nb-NO")} {config.unit || ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4 h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            {config.type === "bar" ? (
              <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid
                  strokeDasharray="none"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#666", fontSize: 10, fontFamily: "monospace" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#444", fontSize: 10, fontFamily: "monospace" }}
                  axisLine={false}
                  tickLine={false}
                  width={45}
                />
                <Tooltip content={<ChartTooltipContent unit={config.unit} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                {config.datasets.map((ds, i) => (
                  <Bar
                    key={ds.label}
                    dataKey={ds.label}
                    fill={`rgba(45,212,191,${0.3 + i * 0.2})`}
                    radius={[3, 3, 0, 0]}
                  />
                ))}
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <defs>
                  <linearGradient id="chartAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(45,212,191,0.2)" />
                    <stop offset="100%" stopColor="rgba(45,212,191,0)" />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="none"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#666", fontSize: 10, fontFamily: "monospace" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#444", fontSize: 10, fontFamily: "monospace" }}
                  axisLine={false}
                  tickLine={false}
                  width={45}
                />
                <Tooltip content={<ChartTooltipContent unit={config.unit} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                {config.datasets.map((ds) => (
                  <Area
                    key={`area-${ds.label}`}
                    type="monotone"
                    dataKey={ds.label}
                    fill="url(#chartAreaGradient)"
                    stroke="none"
                  />
                ))}
                {config.datasets.map((ds) => (
                  <Line
                    key={ds.label}
                    type="monotone"
                    dataKey={ds.label}
                    stroke="#2DD4BF"
                    strokeWidth={2}
                    dot={{ fill: "#2DD4BF", stroke: "#111113", strokeWidth: 2, r: 3.5 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
