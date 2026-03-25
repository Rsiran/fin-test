"use client";

import { Id } from "@/convex/_generated/dataModel";
import { useReportFilter } from "./report-filter-context";
import { KpiCard } from "./kpi-card";
import { RevenueChart } from "./revenue-chart";
import { MarginsChart } from "./margins-chart";
import { CashflowChart } from "./cashflow-chart";
import { ComparisonTable } from "./comparison-table";
import { sortPeriods } from "@/lib/period-format";

interface Metric {
  metricName: string;
  period: string;
  value: number;
  unit: string;
  source?: "extracted" | "derived";
}

export function OverviewTab(_props: { companyId: Id<"companies"> }) {
  const { filteredMetrics: metrics, isFiltered, resetFilters } = useReportFilter();

  if (metrics === undefined) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-24" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="skeleton h-64" />
          <div className="skeleton h-64" />
        </div>
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-4">Oversikt</h2>
        <p className="text-sm text-[#666666]">
          {isFiltered ? (
            <>
              Ingen nøkkeltall matcher filteret.{" "}
              <button onClick={resetFilters} className="text-accent hover:text-accent/80 transition-colors duration-150">
                Nullstill filter
              </button>
            </>
          ) : (
            "Last opp rapporter under Dokumenter-fanen for å se finansielle nøkkeltall."
          )}
        </p>
      </div>
    );
  }

  const typedMetrics = metrics as Metric[];
  const periods = sortPeriods([...new Set(typedMetrics.map((m) => m.period))]);
  const latestPeriod = periods[periods.length - 1];
  const prevPeriod = periods.length >= 2 ? periods[periods.length - 2] : null;

  const getLatest = (name: string) =>
    typedMetrics.find((m) => m.metricName === name && m.period === latestPeriod);
  const getPrev = (name: string) =>
    prevPeriod ? typedMetrics.find((m) => m.metricName === name && m.period === prevPeriod) : null;

  const calcChange = (name: string) => {
    const latest = getLatest(name);
    const prev = getPrev(name);
    if (!latest || !prev || prev.value === 0) return undefined;
    return {
      value: ((latest.value - prev.value) / Math.abs(prev.value)) * 100,
      label: `fra ${prevPeriod}`,
    };
  };

  const isDerived = (name: string) =>
    typedMetrics.find((m) => m.metricName === name && m.period === latestPeriod)?.source === "derived";

  const formatValue = (name: string) => {
    const m = getLatest(name);
    if (!m) return "—";
    return m.unit === "%" ? `${m.value.toFixed(1)}%` : `${m.value.toLocaleString("nb-NO")} ${m.unit}`;
  };

  const revenueData = periods.map((p) => ({
    period: p,
    value: typedMetrics.find((m) => m.metricName === "driftsinntekter" && m.period === p)?.value ?? 0,
  }));

  const marginsData = periods.map((p) => ({
    period: p,
    driftsmargin: typedMetrics.find((m) => m.metricName === "driftsmargin" && m.period === p)?.value,
    ebitda_margin: typedMetrics.find((m) => m.metricName === "ebitda_margin" && m.period === p)?.value,
    netto_margin: typedMetrics.find((m) => m.metricName === "netto_margin" && m.period === p)?.value,
  }));

  const cashflowData = periods.map((p) => ({
    period: p,
    operasjonell: typedMetrics.find((m) => m.metricName === "operasjonell_kontantstrom" && m.period === p)?.value,
    investering: typedMetrics.find((m) => m.metricName === "investeringsaktiviteter" && m.period === p)?.value,
    finansiering: typedMetrics.find((m) => m.metricName === "finansieringsaktiviteter" && m.period === p)?.value,
    fcf: typedMetrics.find((m) => m.metricName === "fri_kontantstrom" && m.period === p)?.value,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Driftsinntekter" value={formatValue("driftsinntekter")} change={calcChange("driftsinntekter")} derived={isDerived("driftsinntekter")} />
        <KpiCard label="EBITDA" value={formatValue("ebitda")} change={calcChange("ebitda")} derived={isDerived("ebitda")} />
        <KpiCard label="Fri kontantstrøm" value={formatValue("fri_kontantstrom")} change={calcChange("fri_kontantstrom")} derived={isDerived("fri_kontantstrom")} />
        <KpiCard label="Driftsmargin" value={formatValue("driftsmargin")} change={calcChange("driftsmargin")} derived={isDerived("driftsmargin")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueChart data={revenueData} />
        <MarginsChart data={marginsData} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CashflowChart data={cashflowData} />
        <ComparisonTable metrics={metrics} />
      </div>
    </div>
  );
}
