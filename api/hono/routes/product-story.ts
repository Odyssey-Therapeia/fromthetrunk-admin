import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { errorSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";

const attributeScalarSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const attributeValueSchema = z.union([
  attributeScalarSchema,
  z.array(attributeScalarSchema),
]);

const generateProductStoryRequestSchema = z.object({
  product: z.object({
    name: z.string().optional().default(""),
    storyTitle: z.string().optional().default(""),
    storyNarrative: z.string().optional().default(""),
    storyProvenance: z.string().optional().default(""),
    storyEra: z.string().optional().default(""),
    detailsFabric: z.string().optional().default(""),
    detailsDesigner: z.string().optional().default(""),
    detailsCondition: z.string().optional().default(""),
    detailsLength: z.string().optional().default(""),
    detailsWidth: z.string().optional().default(""),
    priceRupees: z.number().optional().default(0),
    attributeValues: z
      .record(z.string(), attributeValueSchema)
      .optional()
      .default({}),
  }),
});

const generatedStoryResponseSchema = z.object({
  storyNarrative: z.string(),
  storyTitle: z.string().optional(),
});

type GenerateProductStoryInput = z.infer<
  typeof generateProductStoryRequestSchema
>;

type OpenAIResponsePayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
    type?: string;
  }>;
};

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const formatAttributes = (
  attributes: GenerateProductStoryInput["product"]["attributeValues"],
) =>
  Object.entries(attributes ?? {})
    .filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== null && value !== undefined && String(value).trim();
    })
    .map(([key, value]) => {
      const normalizedValue = Array.isArray(value) ? value.join(", ") : value;
      return `${key}: ${normalizedValue}`;
    })
    .join("\n");

const hasUsefulContext = (product: GenerateProductStoryInput["product"]) => {
  const attributeText = formatAttributes(product.attributeValues);

  return Boolean(
    text(product.name) ||
    text(product.storyTitle) ||
    text(product.storyNarrative) ||
    text(product.storyProvenance) ||
    text(product.storyEra) ||
    text(product.detailsFabric) ||
    text(product.detailsDesigner) ||
    text(product.detailsCondition) ||
    text(product.detailsLength) ||
    text(product.detailsWidth) ||
    attributeText,
  );
};

const extractOutputText = (payload: OpenAIResponsePayload) => {
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return "";
};

const buildPrompt = (product: GenerateProductStoryInput["product"]) => {
  const attributes = formatAttributes(product.attributeValues);

  return `
You are writing product storytelling copy for From The Trunk, a premium curated saree brand.

Brand tone:
- elegant, warm, restrained, heritage-led
- premium but not loud
- emotionally evocative, not overly poetic
- grounded in the given facts only
- no fake owner names, no fake exact places, no fake dates
- do not overclaim restoration, rarity, provenance, or authenticity beyond the supplied context
- do not say "used saree"; prefer "pre-loved", "heritage", "one-of-one", "from a private trunk", or "ready for its next chapter" where appropriate

Write:
1. storyTitle: a short product-story title, 4 to 9 words.
2. storyNarrative: 90 to 140 words, preferably 2 short paragraphs.

Use this product context:

Product name: ${product.name || "Not provided"}
Existing story title: ${product.storyTitle || "Not provided"}
Existing rough narrative: ${product.storyNarrative || "Not provided"}
Provenance: ${product.storyProvenance || "Not provided"}
Era: ${product.storyEra || "Not provided"}
Fabric: ${product.detailsFabric || "Not provided"}
Designer: ${product.detailsDesigner || "Not provided"}
Condition: ${product.detailsCondition || "Not provided"}
Length: ${product.detailsLength || "Not provided"}
Width: ${product.detailsWidth || "Not provided"}
Price in rupees: ${product.priceRupees || "Not provided"}

Attributes:
${attributes || "Not provided"}
`.trim();
};

export const registerProductStoryRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "post",
      path: "/generate",
      request: {
        body: {
          content: {
            "application/json": {
              schema: generateProductStoryRequestSchema,
            },
          },
          required: true,
        },
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: generatedStoryResponseSchema,
            },
          },
          description: "Generated product story",
        },
        400: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Missing story context",
        },
        503: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "AI provider not configured",
        },
      },
      tags: ["Product Story"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse as never;

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return c.json(
          {
            code: "OPENAI_NOT_CONFIGURED",
            message: "OPENAI_API_KEY is not configured.",
          },
          503,
        );
      }

      const body = c.req.valid("json");

      if (!hasUsefulContext(body.product)) {
        return c.json(
          {
            code: "PRODUCT_STORY_CONTEXT_REQUIRED",
            message:
              "Add a little context first — product name, fabric, provenance, era, or a rough note.",
          },
          400,
        );
      }

      const model = process.env.OPENAI_STORY_MODEL ?? "gpt-4.1-mini";

      const response = await fetch("https://api.openai.com/v1/responses", {
        body: JSON.stringify({
          input: [
            {
              role: "system",
              content:
                "You generate accurate, elegant product storytelling copy for a premium saree resale brand. Return only valid JSON matching the requested schema.",
            },
            {
              role: "user",
              content: buildPrompt(body.product),
            },
          ],
          model,
          text: {
            format: {
              name: "ftt_product_story",
              schema: {
                additionalProperties: false,
                properties: {
                  storyNarrative: {
                    minLength: 80,
                    type: "string",
                  },
                  storyTitle: {
                    minLength: 4,
                    type: "string",
                  },
                },
                required: ["storyTitle", "storyNarrative"],
                type: "object",
              },
              strict: true,
              type: "json_schema",
            },
            verbosity: "medium",
          },
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        let message = `Story generation failed with ${response.status}.`;

        try {
          const data = (await response.json()) as {
            error?: { message?: string };
          };
          if (data.error?.message) {
            message = data.error.message;
          }
        } catch {
          // no-op
        }

        return c.json(
          {
            code: "PRODUCT_STORY_GENERATION_FAILED",
            message,
          },
          503,
        );
      }

      const data = (await response.json()) as OpenAIResponsePayload;
      const outputText = extractOutputText(data);

      if (!outputText) {
        return c.json(
          {
            code: "PRODUCT_STORY_EMPTY_RESPONSE",
            message: "The generated story response was empty.",
          },
          503,
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(outputText);
      } catch {
        return c.json(
          {
            code: "PRODUCT_STORY_INVALID_RESPONSE",
            message: "The generated story response was not valid JSON.",
          },
          503,
        );
      }

      const result = generatedStoryResponseSchema.parse(parsed);

      return c.json(
        {
          storyNarrative: result.storyNarrative.trim(),
          storyTitle: result.storyTitle?.trim(),
        },
        200,
      );
    },
  );
};
