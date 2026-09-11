import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/apiClient";
import type { StatsResponse } from "../types";

export type StatsPeriod = "week" | "month" | "year";

export function useStats(period: StatsPeriod, date?: string) {
  return useQuery({
    queryKey: ["stats", period, date],
    queryFn: () => apiGet<StatsResponse>(`/api/stats?period=${period}${date ? `&date=${date}` : ""}`),
    placeholderData: (prev) => prev,
  });
}
