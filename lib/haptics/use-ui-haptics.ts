"use client";

import { useWebHaptics } from "web-haptics/react";

export const useUiHaptics = () => {
  const { trigger } = useWebHaptics();

  return {
    error: () => void trigger("error"),
    nudge: () => void trigger("nudge"),
    success: () => void trigger("success"),
  };
};
