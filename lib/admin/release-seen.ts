export type ReleaseSeenStorage = Pick<Storage, "getItem" | "setItem">;

const STORAGE_PREFIX = "ftt:admin:last-seen-release";

const normalizeStoragePart = (value: string) =>
  value.trim().replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown";

export const getReleaseSeenStorageKey = (adminId: string, version: string) =>
  `${STORAGE_PREFIX}:${normalizeStoragePart(adminId)}:${normalizeStoragePart(version)}`;

export const hasSeenRelease = (
  storage: ReleaseSeenStorage,
  adminId: string,
  version: string,
) => {
  try {
    return storage.getItem(getReleaseSeenStorageKey(adminId, version)) === "seen";
  } catch {
    return false;
  }
};

export const markReleaseSeen = (
  storage: ReleaseSeenStorage,
  adminId: string,
  version: string,
) => {
  try {
    storage.setItem(getReleaseSeenStorageKey(adminId, version), "seen");
  } catch {
    // Private browsing and locked-down webviews can reject localStorage writes.
  }
};
