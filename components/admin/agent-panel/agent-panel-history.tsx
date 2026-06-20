"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAgentStore } from "@/lib/store/agent-store";
import { agentChatAdapter } from "@/lib/adapters/agent-chat-rest";
import type { ConversationSummary } from "@/lib/ports/agent-chat";
import { cn } from "@/lib/utils";

const CONVERSATIONS_QUERY_KEY = ["agent-conversations"] as const;

// Pure: relative time is computed from `iso` and a `now` captured by the caller,
// so it never reads the clock during render.
const formatRelativeTime = (iso: string, now: number) => {
  const diff = now - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
};

export function AgentPanelHistory() {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // Snapshot "now" once at mount so relative-time formatting stays pure across
  // renders (Date.now() must not be called during render).
  const [now] = useState(() => Date.now());

  const conversationId = useAgentStore((s) => s.conversationId);
  const setHistoryOpen = useAgentStore((s) => s.setHistoryOpen);
  const queryClient = useQueryClient();

  const conversationsQuery = useQuery({
    queryFn: () => agentChatAdapter.listConversations(),
    queryKey: CONVERSATIONS_QUERY_KEY,
  });
  const conversations = conversationsQuery.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => agentChatAdapter.deleteConversation(id),
    onError: (err, id) => {
      console.error(
        `[agent-panel-history] Failed to delete conversation ${id}:`,
        err,
      );
      toast.error("Failed to delete conversation.");
    },
    onSuccess: (_data, id) => {
      // Remove the row from the cache on success only (no refetch), matching
      // the original optimistic-after-await behavior.
      queryClient.setQueryData<ConversationSummary[]>(
        CONVERSATIONS_QUERY_KEY,
        (prev) => (prev ?? []).filter((c) => c.id !== id),
      );
    },
  });

  const handleSelect = async (id: string) => {
    setLoadingId(id);
    try {
      const conv = await agentChatAdapter.getConversation(id);
      // switchConversation sets ID, pendingMessages, and increments runtimeKey
      // so the provider remounts and hydrates with the stored messages
      useAgentStore.getState().switchConversation(id, conv?.messages ?? []);
      setHistoryOpen(false);
    } catch (err) {
      // Preserve the current conversation on transient failures instead of
      // switching to an empty thread. Surface the error to the user so they
      // can retry.
      console.error(
        `[agent-panel-history] Failed to load conversation ${id}:`,
        err,
      );
      toast.error("Failed to load that conversation. Please try again.");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[#333] px-4 py-3">
        <p className="text-sm font-medium text-[#e5e5e5]">Chat History</p>
        <Button
          onClick={() => setHistoryOpen(false)}
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-[#999] hover:text-[#ccc]"
        >
          Back
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversationsQuery.isPending ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[#777]" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="py-8 text-center text-xs text-[#666]">
            No conversations yet
          </p>
        ) : (
          <ul className="space-y-1 p-2">
            {conversations.map((conv) => (
              <li
                key={conv.id}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-3 py-2 transition-colors",
                  conv.id === conversationId
                    ? "bg-[#333]"
                    : "hover:bg-[#2a2a2a]",
                )}
              >
                <button
                  type="button"
                  onClick={() => void handleSelect(conv.id)}
                  disabled={loadingId === conv.id}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-xs font-medium text-[#ccc]">
                    {conv.title || "Untitled chat"}
                  </p>
                  <p className="text-[10px] text-[#666]">
                    {loadingId === conv.id
                      ? "Loading..."
                      : formatRelativeTime(conv.updatedAt, now)}
                  </p>
                </button>
                <Button
                  onClick={() => deleteMutation.mutate(conv.id)}
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0 text-[#666] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
