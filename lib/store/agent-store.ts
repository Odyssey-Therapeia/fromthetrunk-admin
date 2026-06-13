import { create } from "zustand";

export type AgentPanelState = {
  isOpen: boolean;
  /** Always set -- stable key for conversation persistence */
  conversationId: string;
  /** Incrementing key to force runtime remount (new chat / switch conversation) */
  runtimeKey: number;
  /** Product context */
  anchoredProductId: string | null;
  anchoredProductName: string | null;
  /** Selected model */
  modelId: string;
  /** Whether extended thinking is enabled */
  thinkingEnabled: boolean;
  /** Thinking effort level */
  thinkingEffort: "low" | "medium" | "high" | "max";
  /** Messages to hydrate when switching to an existing conversation */
  pendingMessages: unknown[] | null;
  /** Admin name for personalized greeting */
  adminName: string | null;

  toggle: () => void;
  open: () => void;
  close: () => void;
  setConversationId: (id: string) => void;
  anchorProduct: (productId: string | null, productName?: string | null) => void;
  setModelId: (modelId: string) => void;
  setThinkingEnabled: (enabled: boolean) => void;
  setThinkingEffort: (effort: "low" | "medium" | "high" | "max") => void;
  /** Clear messages and start fresh */
  newChat: () => void;
  /** Load an existing conversation -- sets ID, messages, and remounts */
  switchConversation: (id: string, messages: unknown[]) => void;
  setPendingMessages: (msgs: unknown[] | null) => void;
  setAdminName: (name: string | null) => void;
};

export const useAgentStore = create<AgentPanelState>((set) => ({
  isOpen: false,
  conversationId: crypto.randomUUID(),
  runtimeKey: 0,
  anchoredProductId: null,
  anchoredProductName: null,
  modelId: "claude-sonnet-4-6",
  thinkingEnabled: true,
  thinkingEffort: "medium",
  pendingMessages: null,
  adminName: null,

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),

  setConversationId: (id) => set({ conversationId: id }),

  anchorProduct: (productId, productName) =>
    set({
      anchoredProductId: productId,
      anchoredProductName: productName ?? null,
    }),

  setModelId: (modelId) => set({ modelId }),
  setThinkingEnabled: (thinkingEnabled) => set({ thinkingEnabled }),
  setThinkingEffort: (thinkingEffort) => set({ thinkingEffort }),

  newChat: () =>
    set((s) => ({
      conversationId: crypto.randomUUID(),
      runtimeKey: s.runtimeKey + 1,
      anchoredProductId: null,
      anchoredProductName: null,
      pendingMessages: null,
    })),

  switchConversation: (id, messages) =>
    set((s) => ({
      conversationId: id,
      pendingMessages: messages,
      runtimeKey: s.runtimeKey + 1,
    })),

  setPendingMessages: (msgs) => set({ pendingMessages: msgs }),
  setAdminName: (name) => set({ adminName: name }),
}));
