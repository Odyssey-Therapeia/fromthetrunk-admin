export const PRODUCT_STORY_APPLIED_EVENT = "ftt:product-story-applied";

export type StoryDraftResult = {
  storyEra?: string;
  storyNarrative?: string;
  storyProvenance?: string;
  storyTitle?: string;
};

export type StoryPatchPayload = Partial<{
  storyEra: string;
  storyNarrative: string;
  storyProvenance: string;
  storyTitle: string;
}>;

export type ProductStoryAppliedEventDetail = {
  productId: string;
  values: StoryPatchPayload;
};

/**
 * Trims optional story text and treats blank input as absent.
 * @param value Optional story field value from an AI draft.
 * @returns The trimmed value, or undefined for empty or whitespace-only input.
 */
const normalizeStoryValue = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Builds a story patch payload from an AI draft, omitting empty fields.
 * @param result AI-generated draft story fields.
 * @returns A story patch payload containing only normalized present values.
 */
export const buildStoryPatchPayload = (
  result: StoryDraftResult | undefined,
): StoryPatchPayload => {
  const payload: StoryPatchPayload = {};
  const storyTitle = normalizeStoryValue(result?.storyTitle);
  const storyNarrative = normalizeStoryValue(result?.storyNarrative);
  const storyProvenance = normalizeStoryValue(result?.storyProvenance);
  const storyEra = normalizeStoryValue(result?.storyEra);

  if (storyTitle) payload.storyTitle = storyTitle;
  if (storyNarrative) payload.storyNarrative = storyNarrative;
  if (storyProvenance) payload.storyProvenance = storyProvenance;
  if (storyEra) payload.storyEra = storyEra;

  return payload;
};

/**
 * Checks whether a story patch payload contains at least one field.
 * @param payload Story patch payload to inspect.
 * @returns True when the payload contains one or more story fields.
 */
export const hasStoryPatchPayload = (payload: StoryPatchPayload) =>
  Object.keys(payload).length > 0;
