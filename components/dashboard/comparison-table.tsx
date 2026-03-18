"use client";

import { sortPeriods } from "@/lib/period-format";

interface ComparisonTableProps {
  metrics: {
    period: string;
    metricName: string;
    value: number;
    unit: string;
  }[];
}

const DISPLAY_METRICS = [
  { key: "driftsinntekter", label: "Driftsinntekter" },
  { key: "ebitda", label: "EBITDA" },
  { key: "driftsmargin", label: "Driftsmargin" },
  { key: "fri_kontantstrom", label: "FCF" },
  { key: "egenkapitalandel", label: "Egenkapitalandel" },
  { key: "aarsresultat", label: "Årsresultat" },
];

export function ComparisonTable({ metrics }: ComparisonTableProps) {
  const periods = sortPeriods([...new Set(metrics.map((m) => m.period))]);

  const getValue = (metricName: string, period: string) => {
    const m = metrics.find((x) => x.metricName === metricName && x.period === period);
    if (!m) return null;
    return m.unit === "%" ? `${m.value.toFixed(1)}%` : m.value.toLocaleString("nb-NO");
  };

  const latestPeriod = periods[periods.length - 1];

  return (
    <div className="bg-elevated rounded-card shadow-card p-5">
      <h3 className="text-[9px] font-sans uppercase tracking-[1px] text-[#666666] mb-4">
        Nøkkeltall — Sammenligning
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-2 pr-4 text-[9px] uppercase tracking-[1px] text-[#666666] font-sans font-normal">
                Nøkkeltall
              </th>
              {periods.map((p) => (
                <th
                  key={p}
                  className="text-right py-2 px-3 text-[9px] uppercase tracking-[1px] text-[#666666] font-mono font-normal"
                >
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DISPLAY_METRICS.map((dm) => (
              <tr
                key={dm.key}
                className="border-t border-white/5 hover:bg-white/[0.03] transition-colors duration-150"
              >
                <td className="py-2.5 pr-4 font-sans text-sm text-[#AAAAAA]">
                  {dm.label}
                </td>
                {periods.map((p) => {
                  const val = getValue(dm.key, p);
                  return (
                    <td
                      key={p}
                      className={`text-right py-2.5 px-3 font-mono text-sm ${
                        p === latestPeriod ? "text-accent font-medium" : "text-[#F5F5F5]"
                      }`}
                    >
                      {val ?? "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
