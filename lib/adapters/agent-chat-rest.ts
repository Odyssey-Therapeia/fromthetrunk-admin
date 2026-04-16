import type { UIMessage } from "ai";

import type { AgentChatPort, ConversationSummary } from "@/lib/ports/agent-chat";

class AgentChatRestAdapter implements AgentChatPort {
  getChatTransportConfig(params: {
    conversationId: string;
    productId?: string | null;
    formContext?: Record<string, unknown>;
    modelId?: string;
    thinkingEnabled?: boolean;
    thinkingEffort?: "low" | "medium" | "high" | "max";
  }) {
    return {
      api: "/api/chat",
      body: () => ({
        conversationId: params.conversationId,
        productId: params.productId ?? undefined,
        formContext: params.formContext ?? undefined,
        modelId: params.modelId ?? undefined,
        thinkingEnabled: params.thinkingEnabled,
        thinkingEffort: params.thinkingEffort,
      }),
    };
  }

  async listConversations(): Promise<ConversationSummary[]> {
    const res = await fetch("/api/v2/conversations");
    if (!res.ok) throw new Error("Failed to load conversations");
    return res.json();
  }

  async getConversation(
    id: string,
  ): Promise<{
    id: string;
    messages: UIMessage[];
    productId: string | null;
  } | null> {
    const res = await fetch(`/api/v2/conversations/${id}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Failed to load conversation");
    return res.json();
  }

  async deleteConversation(id: string): Promise<boolean> {
    const res = await fetch(`/api/v2/conversations/${id}`, {
      method: "DELETE",
    });
    return res.ok;
  }

  async createConversation(): Promise<{ id: string }> {
    const res = await fetch("/api/v2/conversations", { method: "POST" });
    if (!res.ok) throw new Error("Failed to create conversation");
    return res.json();
  }
}

export const agentChatAdapter = new AgentChatRestAdapter();
