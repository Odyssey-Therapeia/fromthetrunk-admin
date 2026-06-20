"use client";
import { useAgentStore } from "@/lib/store/agent-store";
import { useAutoAnchorProduct } from "@/lib/hooks/use-auto-anchor-product";
import { AgentAnchorBar } from "./agent-anchor-bar";
import { AgentPanelComposer } from "./agent-panel-composer";
import { AgentPanelHeader } from "./agent-panel-header";
import { AgentPanelHistory } from "./agent-panel-history";
import { AgentPanelMessages } from "./agent-panel-messages";
import { AgentToolUIRegistrations } from "./tool-uis";

export function AgentPanel() {
  const isOpen = useAgentStore((s) => s.isOpen);
  const isHistoryOpen = useAgentStore((s) => s.isHistoryOpen);
  // Auto-detect product from URL and anchor the panel
  useAutoAnchorProduct();
  if (!isOpen) return null;
  return (
    <aside className="fixed right-0 top-0 z-40 flex h-screen w-100 flex-col border-l border-[#333] bg-[#1a1a1a] text-[#e5e5e5] shadow-2xl">
      <AgentToolUIRegistrations />
      <AgentPanelHeader />
      {isHistoryOpen ? (
        <AgentPanelHistory />
      ) : (
        <>
          <div className="flex-1 overflow-hidden">
            <AgentPanelMessages />
          </div>
          <AgentPanelComposer />
          <AgentAnchorBar />
        </>
      )}
    </aside>
  );
}
