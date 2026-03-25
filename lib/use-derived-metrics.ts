import { useMemo } from "react";
import { deriveStandaloneQuarters, type StoredMetric } from "./period-derivation";

export function useDerivedMetrics(metrics: StoredMetric[] | undefined) {
  return useMemo(() => {
    if (!metrics) return undefined;
    return deriveStandaloneQuarters(metrics);
  }, [metrics]);
}
