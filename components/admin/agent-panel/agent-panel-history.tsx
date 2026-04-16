"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAgentStore } from "@/lib/store/agent-store";
import { agentChatAdapter } from "@/lib/adapters/agent-chat-rest";
import type { ConversationSummary } from "@/lib/ports/agent-chat";
import { cn } from "@/lib/utils";

type AgentPanelHistoryProps = {
  onClose: () => void;
};

export function AgentPanelHistory({ onClose }: AgentPanelHistoryProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const conversationId = useAgentStore((s) => s.conversationId);

  useEffect(() => {
    setIsLoading(true);
    agentChatAdapter
      .listConversations()
      .then(setConversations)
      .catch(() => setConversations([]))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSelect = async (id: string) => {
    setLoadingId(id);
    try {
      const conv = await agentChatAdapter.getConversation(id);
      // switchConversation sets ID, pendingMessages, and increments runtimeKey
      // so the provider remounts and hydrates with the stored messages
      useAgentStore.getState().switchConversation(id, conv?.messages ?? []);
      onClose();
    } catch {
      // Fallback: just switch ID without messages
      useAgentStore.getState().switchConversation(id, []);
      onClose();
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    await agentChatAdapter.deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
  };

  const formatDate = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[#333] px-4 py-3">
        <p className="text-sm font-medium text-[#e5e5e5]">Chat History</p>
        <Button
          onClick={onClose}
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-[#999] hover:text-[#ccc]"
        >
          Back
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
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
                    {loadingId === conv.id ? "Loading..." : formatDate(conv.updatedAt)}
                  </p>
                </button>
                <Button
                  onClick={() => void handleDelete(conv.id)}
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
