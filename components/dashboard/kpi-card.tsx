interface KpiCardProps {
  label: string;
  value: string;
  change?: { value: number; label: string };
}

export function KpiCard({ label, value, change }: KpiCardProps) {
  return (
    <div className="bg-elevated rounded-card shadow-card p-4 hover:shadow-card-hover transition-shadow duration-150">
      <div className="text-[9px] font-sans uppercase tracking-[1px] text-[#666666]">
        {label}
      </div>
      <div className="text-xl font-mono font-medium text-accent mt-1.5">
        {value}
      </div>
      {change && (
        <div
          className={`text-[10px] font-mono mt-1.5 ${
            change.value >= 0 ? "text-positive" : "text-negative"
          }`}
        >
          {change.value >= 0 ? "▲" : "▼"} {Math.abs(change.value).toFixed(1)}%{" "}
          {change.label}
        </div>
      )}
    </div>
  );
}
