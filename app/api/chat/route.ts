import { anthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  type InferUITools,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth/get-session";
import {
  buildSystemPrompt,
  productAssistantFormContextSchema,
} from "@/lib/ai/prompts/product-assistant";
import { productTools } from "@/lib/ai/tools/product-tools";
import {
  getConversationById,
  upsertConversation,
} from "@/db/queries/conversations";

export const maxDuration = 120;

type ProductAssistantUIMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof productTools>
>;

const chatRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  formContext: productAssistantFormContextSchema.optional(),
  messages: z.array(z.unknown()),
  productId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey || apiKey.startsWith("{{")) {
    return Response.json(
      {
        code: "API_KEY_MISSING",
        error: "ANTHROPIC_API_KEY is not configured. Add it to .env.local.",
      },
      { status: 503 },
    );
  }

  const session = await getServerAuthSession();
  if (!session || session.user.role !== "admin") {
    return Response.json(
      { code: "UNAUTHORIZED", error: "Admin access required." },
      { status: 401 },
    );
  }

  const userId = session.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { code: "INVALID_JSON", error: "Invalid request body." },
      { status: 400 },
    );
  }

  const parsedBody = chatRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json(
      {
        code: "INVALID_REQUEST",
        error: "Invalid request body.",
        issues: parsedBody.error.flatten(),
      },
      { status: 400 },
    );
  }

  const {
    conversationId,
    formContext,
    messages: inputMessages,
    productId,
  } = parsedBody.data;
  const validatedMessages = await safeValidateUIMessages<ProductAssistantUIMessage>({
    messages: inputMessages,
    tools: productTools,
  });

  if (!validatedMessages.success) {
    return Response.json(
      { code: "INVALID_MESSAGES", error: validatedMessages.error.message },
      { status: 400 },
    );
  }

  if (conversationId) {
    try {
      const existing = await getConversationById(conversationId);
      if (existing && existing.userId !== userId) {
        return Response.json(
          { code: "FORBIDDEN", error: "Not your conversation." },
          { status: 403 },
        );
      }
    } catch {
      // Table may not exist yet; proceed without persistence check.
    }
  }

  const systemPrompt = buildSystemPrompt(formContext);

  try {
    const result = streamText({
      model: anthropic("claude-opus-4-6"),
      providerOptions: {
        anthropic: {
          effort: "medium",
          thinking: { type: "adaptive" },
        },
      },
      system: systemPrompt,
      messages: await convertToModelMessages(validatedMessages.data, {
        tools: productTools,
      }),
      tools: productTools,
      stopWhen: stepCountIs(25),
      onFinish: async () => {
        if (conversationId) {
          try {
            await upsertConversation(
              conversationId,
              userId,
              validatedMessages.data,
              productId,
            );
          } catch (err) {
            console.error("[api/chat] Failed to persist conversation:", err);
          }
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[api/chat] Stream error:", error);
    const message =
      error instanceof Error ? error.message : "AI generation failed";
    return Response.json(
      { code: "STREAM_ERROR", error: message },
      { status: 500 },
    );
  }
}
