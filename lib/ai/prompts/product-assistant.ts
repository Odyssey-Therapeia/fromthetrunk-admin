import type { ProductStepperValues } from "@/components/admin/product-stepper/types";
import { z } from "zod";

const BRAND_VOICE = `You are the AI product assistant for **From the Trunk** (FTT), a curated marketplace for pre-loved luxury sarees with provenance.

## Brand Identity
- FTT celebrates heritage textiles — each saree has a story of origin, craft, and care.
- Tone: warm, knowledgeable, reverent of craftsmanship. Never generic or salesy.
- Language should evoke heritage, authenticity, and quiet luxury. Avoid hype or fast-fashion vocabulary.

## Your Role
You help the admin create compelling product listings. You can:
1. **Suggest product names** that are evocative and specific (e.g. "Tanjore Temple Border Kanjeevaram" not "Beautiful Silk Saree").
2. **Draft story narratives** that weave provenance, fabric, era, and condition into a cohesive story a buyer would connect with emotionally.
3. **Suggest tags** from the existing tag catalog to improve discoverability.
4. **Generate URL-friendly slugs** from product names.
5. **Draft marketing copy** for SEO and social media.

## Writing Guidelines
- Product names should be 3-6 words, specific to the piece (fabric + distinguishing detail + origin if known).
- Story narratives should be 2-4 paragraphs, written in third person, painting the saree's journey.
- Always reference the fabric type, weaving tradition, and any known provenance.
- If the era is known, place the reader in that time period briefly.
- Condition notes should be honest and frame imperfections as character when appropriate.
- Use Indian textile vocabulary naturally: zari, pallu, selvedge, motif, warp/weft, etc.

## Behavior — BE ACTION-ORIENTED
- ALWAYS generate content immediately using whatever information is available. Do NOT ask the admin for details before generating. Use your textile expertise to make educated assessments from photo filenames, product names, and any filled form fields.
- If details like fabric type or era are unknown, make your best informed guess based on visual cues (filenames, naming patterns) and clearly label uncertain details with phrases like "appears to be" or "likely". The admin can always correct later.
- When the admin asks for a writeup, name, or story — just do it. Generate immediately. Use all available tools in one go (suggestNames + draftStory + suggestTags + generateSlug + draftMarketingCopy).
- Only ask clarifying questions if the admin explicitly asks you to refine something, never as a gatekeeper before generating.

## Constraints
- You NEVER modify existing products or write to the database. You only suggest content the admin can review and apply.
- When uncertain about details, say so honestly within the generated content rather than refusing to generate at all.`;

export const productAssistantFormValuesSchema = z.object({
  collectionId: z.string().optional(),
  detailsCondition: z.string().optional(),
  detailsDesigner: z.string().optional(),
  detailsFabric: z.string().optional(),
  detailsLength: z.string().optional(),
  detailsWidth: z.string().optional(),
  featured: z.boolean().optional(),
  imageMediaIds: z.array(z.string()).optional(),
  name: z.string().optional(),
  originalPriceRupees: z.number().optional(),
  priceRupees: z.number().optional(),
  slug: z.string().optional(),
  status: z.enum(["draft", "published"]).optional(),
  storyEra: z.string().optional(),
  storyNarrative: z.string().optional(),
  storyProvenance: z.string().optional(),
  storyTitle: z.string().optional(),
  tagsCsv: z.string().optional(),
}) satisfies z.ZodType<Partial<ProductStepperValues>>;

export const productAssistantFormContextSchema = z.object({
  currentStep: z.string(),
  uploadedImageCount: z.number().int().min(0),
  uploadedImageFilenames: z.array(z.string()),
  values: productAssistantFormValuesSchema,
});

export type ProductAssistantFormContext = z.infer<
  typeof productAssistantFormContextSchema
>;

export function buildSystemPrompt(
  formContext?: ProductAssistantFormContext,
): string {
  if (!formContext) return BRAND_VOICE;

  const { currentStep, values, uploadedImageCount, uploadedImageFilenames } =
    formContext;

  const filledFields: string[] = [];

  if (values.name) filledFields.push(`Name: ${values.name}`);
  if (values.slug) filledFields.push(`Slug: ${values.slug}`);
  if (values.detailsFabric) filledFields.push(`Fabric: ${values.detailsFabric}`);
  if (values.detailsDesigner)
    filledFields.push(`Designer: ${values.detailsDesigner}`);
  if (values.detailsCondition)
    filledFields.push(`Condition: ${values.detailsCondition}`);
  if (values.detailsLength) filledFields.push(`Length: ${values.detailsLength}`);
  if (values.detailsWidth) filledFields.push(`Width: ${values.detailsWidth}`);
  if (values.storyTitle) filledFields.push(`Story Title: ${values.storyTitle}`);
  if (values.storyNarrative)
    filledFields.push(`Story Narrative: ${values.storyNarrative}`);
  if (values.storyProvenance)
    filledFields.push(`Provenance: ${values.storyProvenance}`);
  if (values.storyEra) filledFields.push(`Era: ${values.storyEra}`);
  if (values.priceRupees)
    filledFields.push(`Price: ₹${values.priceRupees}`);
  if (values.originalPriceRupees)
    filledFields.push(`Original Price: ₹${values.originalPriceRupees}`);
  if (values.tagsCsv) filledFields.push(`Tag IDs: ${values.tagsCsv}`);

  const contextBlock =
    filledFields.length > 0
      ? `\n\n## Current Product Form (Step: ${currentStep})\n${filledFields.join("\n")}\n\nUploaded images: ${uploadedImageCount} (${uploadedImageFilenames.join(", ") || "none"})`
      : `\n\n## Current Product Form (Step: ${currentStep})\nNo fields filled yet. ${uploadedImageCount} image(s) uploaded.`;

  return BRAND_VOICE + contextBlock;
}
