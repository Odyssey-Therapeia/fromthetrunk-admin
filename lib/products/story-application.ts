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

const normalizeStoryValue = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

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

export const hasStoryPatchPayload = (payload: StoryPatchPayload) =>
  Object.keys(payload).length > 0;
