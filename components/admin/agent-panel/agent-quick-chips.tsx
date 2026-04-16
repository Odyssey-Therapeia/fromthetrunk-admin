"use client";

import { useComposerRuntime } from "@assistant-ui/react";

const QUICK_ACTIONS = [
  { label: "REVIEW STOCK", prompt: "Review the current stock status across all products" },
  { label: "DRAFT STORY", prompt: "Draft a compelling story for the product I'm currently working on" },
  { label: "PRICE TRENDS", prompt: "Analyze pricing patterns across the catalog" },
] as const;

export function AgentQuickChips() {
  const composerRuntime = useComposerRuntime();

  const handleChip = (prompt: string) => {
    composerRuntime.setText(prompt);
    composerRuntime.send();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {QUICK_ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => handleChip(action.prompt)}
          className="rounded-full border border-[#444] px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-[#ccc] transition-colors hover:border-[#c9a96e] hover:text-[#c9a96e]"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
