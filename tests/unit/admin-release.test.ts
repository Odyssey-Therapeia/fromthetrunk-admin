import { describe, expect, it } from "vitest";

import { currentAdminRelease } from "@/lib/admin/releases";
import {
  getReleaseSeenStorageKey,
  hasSeenRelease,
  markReleaseSeen,
  type ReleaseSeenStorage,
} from "@/lib/admin/release-seen";

const createMemoryStorage = (): ReleaseSeenStorage & { values: Map<string, string> } => {
  const values = new Map<string, string>();

  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

describe("admin release metadata", () => {
  it("defines the current release announcement", () => {
    expect(currentAdminRelease.version).toBe("0.27.0");
    expect(currentAdminRelease.name).toBe("The Control Centre Release");
    expect(currentAdminRelease.showAnnouncement).toBe(true);
    expect(currentAdminRelease.highlights.length).toBeGreaterThanOrEqual(4);
    expect(currentAdminRelease.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Added" }),
        expect.objectContaining({ title: "Updated" }),
        expect.objectContaining({ title: "Fixed" }),
      ]),
    );
  });
});

describe("release seen storage", () => {
  it("tracks a release per admin and version", () => {
    const storage = createMemoryStorage();

    expect(hasSeenRelease(storage, "admin@example.com", "0.25.0")).toBe(false);
    markReleaseSeen(storage, "admin@example.com", "0.25.0");

    expect(hasSeenRelease(storage, "admin@example.com", "0.25.0")).toBe(true);
    expect(hasSeenRelease(storage, "admin@example.com", "0.26.0")).toBe(false);
  });

  it("sanitizes key parts for localStorage", () => {
    expect(getReleaseSeenStorageKey("abe@example.com", "0.25.0")).toBe(
      "ftt:admin:last-seen-release:abe_example.com:0.25.0",
    );
  });

  it("treats storage read failures as unseen so the update can still appear", () => {
    const storage: ReleaseSeenStorage = {
      getItem: () => {
        throw new Error("localStorage unavailable");
      },
      setItem: () => undefined,
    };

    expect(hasSeenRelease(storage, "admin@example.com", "0.25.0")).toBe(false);
  });
});
