"use client";

import { useMemo } from "react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import type { UIMessage } from "ai";
import { toast } from "sonner";

import { useAgentStore } from "@/lib/store/agent-store";

/**
 * Creates a STABLE AssistantRuntime for the detached agent panel.
 *
 * Critical design: the transport is created ONCE (empty deps). Dynamic values
 * (conversationId, modelId, productId) are read at request-time via
 * `useAgentStore.getState()` inside the `body` function. This prevents
 * transport recreation on every state change, which was causing the entire
 * runtime tree to remount and kill keyboard focus.
 *
 * The provider uses `key={runtimeKey}` to force remount ONLY for intentional
 * actions: "New Chat" and "Switch Conversation".
 */
export function useAgentChat() {
  // Read pending messages at mount time (consumed once on provider remount)
  const pendingMessages = useAgentStore((s) => s.pendingMessages);

  const initialMessages = useMemo(() => {
    const msgs = pendingMessages;
    if (msgs) {
      // Clear after consuming so the next mount doesn't re-hydrate
      useAgentStore.getState().setPendingMessages(null);
    }
    return (msgs as UIMessage[] | undefined) ?? undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on mount
  }, []);

  // Transport created ONCE -- body reads latest store values per-request
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/api/chat",
        body: () => {
          const s = useAgentStore.getState();
          return {
            conversationId: s.conversationId,
            productId: s.anchoredProductId ?? undefined,
            modelId: s.modelId,
            thinkingEnabled: s.thinkingEnabled,
            thinkingEffort: s.thinkingEffort,
          };
        },
      }),
    [], // stable -- no deps
  );

  return useChatRuntime({
    transport,
    messages: initialMessages,
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "AI request failed";
      toast.error(message);
    },
  });
}
