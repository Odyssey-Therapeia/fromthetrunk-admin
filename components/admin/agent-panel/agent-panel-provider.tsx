"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";

import { useAgentChat } from "@/lib/hooks/use-agent-chat";
import { useAgentStore } from "@/lib/store/agent-store";

import { AgentPanel } from "./agent-panel";

/**
 * Layout-level provider. Uses `runtimeKey` to force-remount the
 * AssistantRuntimeProvider when the user clicks "New Chat", which
 * clears the message history in the thread UI.
 */
export function AgentPanelProvider() {
  const runtime = useAgentChat();
  const runtimeKey = useAgentStore((s) => s.runtimeKey);

  return (
    <AssistantRuntimeProvider key={runtimeKey} runtime={runtime}>
      <AgentPanel />
    </AssistantRuntimeProvider>
  );
}
