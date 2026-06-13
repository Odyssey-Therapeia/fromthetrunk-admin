"use client";

import { useQuery } from "@tanstack/react-query";

import { dashboardAdapter } from "@/lib/adapters/dashboard-rest";

export function useDashboard() {
  const metrics = useQuery({
    queryKey: ["admin", "dashboard", "metrics"],
    queryFn: () => dashboardAdapter.getMetrics(),
    refetchInterval: 60_000,
  });

  const activity = useQuery({
    queryKey: ["admin", "dashboard", "activity"],
    queryFn: () => dashboardAdapter.getRecentActivity(20),
    refetchInterval: 60_000,
  });

  return {
    metrics: metrics.data ?? null,
    activity: activity.data ?? [],
    isLoading: metrics.isLoading || activity.isLoading,
    error: {
      metrics: metrics.error,
      activity: activity.error,
    },
  };
}
