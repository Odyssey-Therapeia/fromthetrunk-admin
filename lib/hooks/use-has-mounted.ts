"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export const useHasMounted = () =>
  useSyncExternalStore(subscribe, () => true, () => false);
