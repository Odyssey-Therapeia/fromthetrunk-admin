"use client";

import { ChevronRight, Paperclip, Puzzle, BarChart3, Plug } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const menuItems = [
  { icon: Paperclip, label: "Add files or photos", hasSubmenu: false },
  { icon: BarChart3, label: "Skills", hasSubmenu: true },
  { icon: Plug, label: "Connectors", hasSubmenu: true },
  { icon: Puzzle, label: "Add plugins...", hasSubmenu: false },
] as const;

export function AgentPlusMenu() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-10 w-10 shrink-0 rounded-full border border-[#444] text-[#999] hover:border-[#666] hover:text-[#ccc]"
          aria-label="Attachments and tools"
        >
          <span className="text-lg">+</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-55 border-[#444] bg-[#222] p-1"
      >
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-xs text-[#ccc] transition-colors hover:bg-[#333]"
            >
              <Icon className="h-4 w-4 shrink-0 text-[#888]" />
              <span className="flex-1">{item.label}</span>
              {item.hasSubmenu && (
                <ChevronRight className="h-3 w-3 text-[#666]" />
              )}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
