import type {
  ActivityItem,
  DashboardMetrics,
  DashboardPort,
} from "@/lib/ports/dashboard";

class DashboardRestAdapter implements DashboardPort {
  async getMetrics(): Promise<DashboardMetrics> {
    const res = await fetch("/api/v2/admin/dashboard/metrics");
    if (!res.ok) {
      throw new Error(
        `Failed to load dashboard metrics (${res.status} ${res.statusText})`,
      );
    }
    return (await res.json()) as DashboardMetrics;
  }

  async getRecentActivity(limit = 20): Promise<ActivityItem[]> {
    const res = await fetch(
      `/api/v2/admin/dashboard/activity?limit=${limit}`,
    );
    if (!res.ok) {
      throw new Error(
        `Failed to load activity (${res.status} ${res.statusText})`,
      );
    }
    return (await res.json()) as ActivityItem[];
  }
}

export const dashboardAdapter = new DashboardRestAdapter();
