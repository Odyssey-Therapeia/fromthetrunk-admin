"use client";
import { useEffect, useMemo, useState } from "react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import type { UIMessage } from "ai";
import { toast } from "sonner";
import {
  INITIAL_AGENT_CONVERSATION_ID,
  useAgentStore,
} from "@/lib/store/agent-store";

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
  // Capture pending messages ONCE at mount via a lazy useState initializer.
  //
  // The initializer runs exactly once on the first render, and because we only
  // ever read the value (never call the setter), the captured snapshot is stable
  // for the lifetime of the component -- it never re-renders when the store's
  // `pendingMessages` is later cleared. This is the same "snapshot once, stay
  // stable" goal the old `useRef` had, but unlike a ref, reading state during
  // render is legal, so it doesn't trip the React Compiler's
  // "Cannot access refs during render" rule.
  const [initialMessages] = useState<UIMessage[] | undefined>(
    () =>
      (useAgentStore.getState().pendingMessages as UIMessage[] | undefined) ??
      undefined,
  );

  // Side effect: clear the consumed pendingMessages after mount, and promote the
  // sentinel conversation id to a real one. `initialMessages` is referentially
  // stable, so `[initialMessages]` is equivalent to `[]` -- this runs once.
  useEffect(() => {
    if (initialMessages) {
      useAgentStore.getState().setPendingMessages(null);
    }
    const state = useAgentStore.getState();
    if (state.conversationId === INITIAL_AGENT_CONVERSATION_ID) {
      state.setConversationId(crypto.randomUUID());
    }
  }, [initialMessages]);

  // Transport created ONCE -- body reads latest store values per-request
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/api/chat",
        body: () => {
          const s = useAgentStore.getState();
          if (s.conversationId === INITIAL_AGENT_CONVERSATION_ID) {
            const conversationId = crypto.randomUUID();
            s.setConversationId(conversationId);
            return {
              conversationId,
              productId: s.anchoredProductId ?? undefined,
              modelId: s.modelId,
              thinkingEnabled: s.thinkingEnabled,
              thinkingEffort: s.thinkingEffort,
            };
          }
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
