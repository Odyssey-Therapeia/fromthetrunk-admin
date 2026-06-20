"use client";
import { History, MoreVertical, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAgentStore } from "@/lib/store/agent-store";

export function AgentPanelHeader() {
  // Read each action individually so the header subscribes only to stable action
  // references (they never change identity) instead of the whole store. This
  // keeps the header from re-rendering on every streamed token / setting change,
  // and removes the prop-drilled `onToggleHistory` that tripped the Next.js
  // "props must be serializable" check at this client-entry boundary.
  const newChat = useAgentStore((s) => s.newChat);
  const close = useAgentStore((s) => s.close);
  const toggleHistory = useAgentStore((s) => s.toggleHistory);

  return (
    <div className="flex items-center gap-3 border-b border-[#333] px-4 py-3">
      {/* Branded icon + title */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4B2626]">
        <Sparkles className="h-4 w-4 text-[#c9a96e]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#e5e5e5]">FTT Agent</p>
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#777]">
          Curator Intelligence
        </p>
      </div>
      {/* Menu + close */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-[#999] hover:text-[#ccc]"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="border-[#444] bg-[#222] text-[#ccc]"
        >
          <DropdownMenuItem
            onClick={() => newChat()}
            className="gap-2 text-xs focus:bg-[#333] focus:text-[#e5e5e5]"
          >
            <Plus className="h-3.5 w-3.5" />
            New Chat
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => toggleHistory()}
            className="gap-2 text-xs focus:bg-[#333] focus:text-[#e5e5e5]"
          >
            <History className="h-3.5 w-3.5" />
            Chat History
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        onClick={close}
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-[#999] hover:text-[#ccc]"
        title="Close panel"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
