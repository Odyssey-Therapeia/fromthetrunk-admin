import { getProduct, listProducts, type ProductWithRelations } from "@/db/queries/products";

import { findSimilarProductsByProductId } from "./embeddings";

type Recommendation = {
  product: ProductWithRelations;
  reason: string;
  score: number;
  source: "heuristic" | "semantic";
};

const normalize = (value: null | string | undefined) => value?.trim().toLowerCase() ?? "";

const scoreCandidate = (
  source: ProductWithRelations,
  candidate: ProductWithRelations
) => {
  let score = 0;
  const reasons: string[] = [];

  if (source.collectionId && source.collectionId === candidate.collectionId) {
    score += 2;
    reasons.push("same collection");
  }

  if (normalize(source.storyEra) && normalize(source.storyEra) === normalize(candidate.storyEra)) {
    score += 3;
    reasons.push("same era");
  }

  if (
    normalize(source.detailsFabric) &&
    normalize(source.detailsFabric) === normalize(candidate.detailsFabric)
  ) {
    score += 3;
    reasons.push("matching fabric");
  }

  if (
    normalize(source.detailsDesigner) &&
    normalize(source.detailsDesigner) === normalize(candidate.detailsDesigner)
  ) {
    score += 2;
    reasons.push("matching designer");
  }

  const sourceTags = new Set(source.tags.map((tag) => tag.id));
  const sharedTags = candidate.tags.filter((tag) => sourceTags.has(tag.id));
  if (sharedTags.length > 0) {
    score += sharedTags.length * 2;
    reasons.push(`shared tags (${sharedTags.map((tag) => tag.name).join(", ")})`);
  }

  if (score <= 0) return null;
  return {
    reason: reasons.join(" • "),
    score,
  };
};

const uniqueById = (items: Recommendation[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.product.id)) return false;
    seen.add(item.product.id);
    return true;
  });
};

export const recommendProducts = async (productId: string, limit = 6) => {
  const source = await getProduct(productId);
  if (!source) return [];

  const semanticMatches = await findSimilarProductsByProductId(productId, limit);
  const semanticRecommendations: Recommendation[] = semanticMatches.map((match) => ({
    product: match.product,
    reason: "semantic similarity",
    score: Number(match.similarity),
    source: "semantic",
  }));

  const remainder = Math.max(limit - semanticRecommendations.length, 0);
  let heuristicRecommendations: Recommendation[] = [];
  if (remainder > 0) {
    const candidates = await listProducts({
      includeDrafts: false,
      limit: 200,
    });

    heuristicRecommendations = candidates
      .filter((candidate) => candidate.id !== source.id)
      .reduce<Recommendation[]>((acc, candidate) => {
        const scored = scoreCandidate(source, candidate);
        if (!scored) return acc;

        acc.push({
          product: candidate,
          reason: scored.reason,
          score: scored.score,
          source: "heuristic",
        });

        return acc;
      }, [])
      .sort((a, b) => b.score - a.score)
      .slice(0, remainder);
  }

  return uniqueById([...semanticRecommendations, ...heuristicRecommendations]).slice(0, limit);
};
