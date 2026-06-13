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
  updateConversationTitle,
  upsertConversation,
} from "@/db/queries/conversations";
import { getProduct } from "@/db/queries/products";
import { toRupees } from "@/db/money";
import { ALLOWED_MODEL_IDS, DEFAULT_MODEL_ID } from "@/lib/ports/agent-chat";

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
  modelId: z
    .string()
    .refine((val) => ALLOWED_MODEL_IDS.includes(val), {
      message: "Unsupported modelId",
    })
    .optional(),
  productId: z.string().uuid().optional(),
  thinkingEnabled: z.boolean().optional(),
  thinkingEffort: z.enum(["low", "medium", "high", "max"]).optional(),
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
    modelId,
    productId,
    thinkingEnabled = true,
    thinkingEffort = "medium",
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
    } catch (err: unknown) {
      console.error("[api/chat] Conversation lookup failed (non-blocking):", err);
    }
  }

  // If we have a productId but no formContext, fetch the product and build
  // a synthetic formContext so the AI has full product knowledge.
  let resolvedFormContext = formContext;
  if (productId && !formContext) {
    try {
      const product = await getProduct(productId);
      if (product) {
        resolvedFormContext = {
          currentStep: "General",
          values: {
            name: product.name ?? undefined,
            slug: product.slug ?? undefined,
            priceRupees: product.pricePaise ? toRupees(product.pricePaise) : undefined,
            originalPriceRupees: product.originalPricePaise
              ? toRupees(product.originalPricePaise)
              : undefined,
            storyTitle: product.storyTitle ?? undefined,
            storyNarrative: product.storyNarrative ?? undefined,
            storyProvenance: product.storyProvenance ?? undefined,
            storyEra: product.storyEra ?? undefined,
            detailsFabric: product.detailsFabric ?? undefined,
            detailsLength: product.detailsLength ?? undefined,
            detailsWidth: product.detailsWidth ?? undefined,
            detailsCondition: product.detailsCondition ?? undefined,
            detailsDesigner: product.detailsDesigner ?? undefined,
            status: product.status ?? undefined,
            featured: product.featured ?? undefined,
          },
          uploadedImageCount: product.images?.length ?? 0,
          uploadedImageFilenames: product.images?.map(
            (img: { media: { filename: string } }) => img.media.filename,
          ) ?? [],
        };
      }
    } catch (err) {
      console.error("[api/chat] Product lookup failed (non-blocking):", err);
    }
  }

  const systemPrompt = buildSystemPrompt(resolvedFormContext);

  try {
    const selectedModel = modelId || DEFAULT_MODEL_ID;
    const result = streamText({
      model: anthropic(selectedModel),
      providerOptions: {
        anthropic: {
          effort: thinkingEffort,
          ...(thinkingEnabled && { thinking: { type: "adaptive" as const } }),
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
            const existing = await getConversationById(conversationId);
            await upsertConversation(
              conversationId,
              userId,
              validatedMessages.data,
              productId,
              selectedModel,
            );

            // Auto-generate title from the first user message if none exists
            if (!existing?.title) {
              const firstUserMsg = validatedMessages.data.find(
                (m: { role: string }) => m.role === "user",
              );
              if (firstUserMsg && "content" in firstUserMsg) {
                const content = String(
                  typeof firstUserMsg.content === "string"
                    ? firstUserMsg.content
                    : Array.isArray(firstUserMsg.content)
                      ? firstUserMsg.content
                          .filter(
                            (p: { type: string }) => p.type === "text",
                          )
                          .map((p: { text: string }) => p.text)
                          .join(" ")
                      : "",
                );
                const title = content.slice(0, 80).trim() || "New conversation";
                await updateConversationTitle(
                  conversationId,
                  userId,
                  title,
                );
              }
            }
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
