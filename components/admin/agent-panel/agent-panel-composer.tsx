"use client";

import { ComposerPrimitive } from "@assistant-ui/react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

import { AgentPlusMenu } from "./agent-plus-menu";

export function AgentPanelComposer() {
  return (
    <ComposerPrimitive.Root className="relative flex items-end gap-2 border-t border-[#333] px-3 py-3">
      <AgentPlusMenu />

      <ComposerPrimitive.Input
        placeholder="Ask anything about your store..."
        className="min-h-10 flex-1 resize-none rounded-lg border border-[#444] bg-[#222] px-3 py-2.5 text-sm text-[#e5e5e5] outline-none placeholder:text-[#666] focus:border-[#c9a96e]/50 focus:ring-1 focus:ring-[#c9a96e]/30"
        rows={1}
      />

      <ComposerPrimitive.Send asChild>
        <Button
          className="h-10 shrink-0 gap-1.5 rounded-full bg-[#E87461] px-4 text-sm font-medium text-white hover:bg-[#d4604e]"
          aria-label="Send message"
        >
          Let&apos;s go
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}
