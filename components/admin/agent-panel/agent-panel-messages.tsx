"use client";

import {
  ThreadPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";
import { useSession } from "next-auth/react";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

import { AgentQuickChips } from "./agent-quick-chips";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function ThinkingIndicator() {
  return (
    <ThreadPrimitive.If running>
      <div className="flex items-center gap-2 px-1 py-2">
        <div className="flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#c9a96e]/60 [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#c9a96e]/60 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#c9a96e]/60 [animation-delay:300ms]" />
        </div>
        <span className="text-xs text-[#777]">Thinking...</span>
      </div>
    </ThreadPrimitive.If>
  );
}

function ThreadWelcome() {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] ?? "Curator";
  const greeting = getGreeting();

  return (
    <ThreadPrimitive.Empty>
      <div className="flex flex-col gap-4 py-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#6B1D1D]">
            <Sparkles className="h-4 w-4 text-[#c9a96e]" />
          </div>
          <div>
            <p className="text-sm italic text-[#e5e5e5]">
              {greeting}, {firstName}.
            </p>
            <p className="mt-1 text-xs text-[#777]">
              How can I help with the FTT catalog today?
            </p>
          </div>
        </div>
        <AgentQuickChips />
      </div>
    </ThreadPrimitive.Empty>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#6B1D1D] px-4 py-2.5 text-sm text-white">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start">
      <div
        className={cn(
          "max-w-[85%] rounded-2xl rounded-bl-md bg-[#2a2a2a] px-4 py-2.5 text-sm text-[#e5e5e5]",
          "[&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1",
        )}
      >
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

export function AgentPanelMessages() {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col">
      <ThreadPrimitive.Viewport className="flex flex-1 flex-col gap-4 overflow-y-auto scroll-smooth px-3 pt-4 pb-2">
        <ThreadWelcome />
        <ThreadPrimitive.Messages
          components={{ AssistantMessage, UserMessage }}
        />
        <ThinkingIndicator />
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
