import type { UIMessage } from "ai";

/** The shape of a conversation summary for the history list. */
export type ConversationSummary = {
  id: string;
  title: string | null;
  updatedAt: string;
  productId: string | null;
};

/** Configuration for the AI model. */
export type AgentModelConfig = {
  modelId: string;
  label: string;
};

/** Available models for the agent panel. */
export const AGENT_MODELS: AgentModelConfig[] = [
  { modelId: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { modelId: "claude-opus-4-6", label: "Claude Opus 4.6" },
];

/** Port for agent chat operations -- decouples UI from API layer. */
export interface AgentChatPort {
  /** Returns transport config for @assistant-ui/react. */
  getChatTransportConfig(params: {
    conversationId: string;
    productId?: string | null;
    formContext?: Record<string, unknown>;
    modelId?: string;
  }): { api: string; body: () => Record<string, unknown> };

  /** List conversation history for the current user. */
  listConversations(): Promise<ConversationSummary[]>;

  /** Load a specific conversation's messages. */
  getConversation(id: string): Promise<{
    id: string;
    messages: UIMessage[];
    productId: string | null;
  } | null>;

  /** Delete a conversation. */
  deleteConversation(id: string): Promise<boolean>;

  /** Create a new conversation entry. */
  createConversation(): Promise<{ id: string }>;
}
