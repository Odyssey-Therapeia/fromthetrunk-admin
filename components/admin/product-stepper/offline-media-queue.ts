"use client";

const DB_NAME = "ftt-admin-product-stepper-offline-media";
const DB_VERSION = 1;
const STORE_NAME = "queued-media";
const QUEUE_KEY_INDEX = "queueKey";

export type OfflineMediaQueueSource = "selected" | "edited";

export type OfflineMediaQueueItem = {
  alt: string;
  createdAt: string;
  file: File;
  filename: string;
  id: string;
  mimeType: string;
  queueKey: string;
  queuedForAutoSync: boolean;
  replaceMediaId?: string | null;
  size: number;
  source: OfflineMediaQueueSource;
  updatedAt: string;
};

const canUseIndexedDb = () =>
  typeof window !== "undefined" && "indexedDB" in window;

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });

const openOfflineMediaDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction?.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: "id" });

      if (store && !store.indexNames.contains(QUEUE_KEY_INDEX)) {
        store.createIndex(QUEUE_KEY_INDEX, "queueKey", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open offline media queue."));
  });

export const listOfflineMediaQueueItems = async (queueKey: string) => {
  if (!canUseIndexedDb()) return [];

  const db = await openOfflineMediaDb();

  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index(QUEUE_KEY_INDEX);
    const items = await requestToPromise<OfflineMediaQueueItem[]>(
      index.getAll(queueKey),
    );

    return items.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  } finally {
    db.close();
  }
};

export const upsertOfflineMediaQueueItem = async (
  item: OfflineMediaQueueItem,
) => {
  if (!canUseIndexedDb()) return false;

  const db = await openOfflineMediaDb();

  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    await requestToPromise(store.put(item));
    return true;
  } finally {
    db.close();
  }
};

export const updateOfflineMediaQueueItemAlt = async (
  id: string,
  alt: string,
) => {
  if (!canUseIndexedDb()) return false;

  const db = await openOfflineMediaDb();

  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const existing = await requestToPromise<OfflineMediaQueueItem | undefined>(
      store.get(id),
    );

    if (!existing) return false;

    await requestToPromise(
      store.put({
        ...existing,
        alt,
        updatedAt: new Date().toISOString(),
      }),
    );

    return true;
  } finally {
    db.close();
  }
};

export const markOfflineMediaQueueItemForAutoSync = async (id: string) => {
  if (!canUseIndexedDb()) return false;

  const db = await openOfflineMediaDb();

  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const existing = await requestToPromise<OfflineMediaQueueItem | undefined>(
      store.get(id),
    );

    if (!existing) return false;

    await requestToPromise(
      store.put({
        ...existing,
        queuedForAutoSync: true,
        updatedAt: new Date().toISOString(),
      }),
    );

    return true;
  } finally {
    db.close();
  }
};

export const deleteOfflineMediaQueueItem = async (id: string) => {
  if (!canUseIndexedDb()) return false;

  const db = await openOfflineMediaDb();

  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    await requestToPromise(store.delete(id));
    return true;
  } finally {
    db.close();
  }
};
