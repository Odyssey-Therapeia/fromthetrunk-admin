"use client";

import { useSyncExternalStore } from "react";

const subscribeToNetworkStatus = (onStoreChange: () => void) => {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);

  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
};

const getNetworkSnapshot = () => {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
};

const getServerNetworkSnapshot = () => true;

export const useNetworkStatus = () =>
  useSyncExternalStore(
    subscribeToNetworkStatus,
    getNetworkSnapshot,
    getServerNetworkSnapshot,
  );
