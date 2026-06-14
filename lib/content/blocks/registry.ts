/**
 * P3-02: Closed block registry.
 *
 * Contract (master-plan §3.2 / docs/spikes/blocks/block-inventory.md §4):
 *
 *  - BLOCK_REGISTRY is the single source of truth. Adding a block type =
 *    one new file + one registry.set() call below.
 *  - getBlock(type) returns undefined for unknown types (callers must handle).
 *  - renderBlock({ type, props }) is the safe dispatch path:
 *      1. Rejects unknown types — throws, never renders arbitrary output.
 *      2. Validates props against propsSchema BEFORE invoking Renderer
 *         (defense in depth — props are also validated on save by the editor).
 *      3. Throws a typed error on validation failure so callers can surface
 *         a safe fallback without leaking internal state.
 */

import type { ReactNode } from "react";
import type { ZodTypeAny } from "zod";

// ── Public contract type ────────────────────────────────────────────────────

export type BlockRegistryEntry = {
  /** Discriminant stored in the `blocks` jsonb array. Immutable once shipped. */
  type: string;
  /** Zod schema for the block's props. Used on save AND render (defense in depth). */
  propsSchema: ZodTypeAny;
  /**
   * React Server Component renderer. Receives VALIDATED props.
   * Must consume theme tokens only — no raw hex, no arbitrary px.
   */
  Renderer: (props: Record<string, unknown>) => ReactNode | Promise<ReactNode>;
  /** Metadata consumed by the P3-05 block composer UI. */
  editorMeta: {
    label: string;
    icon: string;        // Lucide icon name
    maxPerPage?: number; // Omit = unlimited
    note?: string;
  };
};

// ── Error types ─────────────────────────────────────────────────────────────

export class UnknownBlockTypeError extends Error {
  constructor(type: string) {
    super(`Unknown block type: "${type}". Register it in lib/content/blocks/registry.ts.`);
    this.name = "UnknownBlockTypeError";
  }
}

export class BlockPropsValidationError extends Error {
  readonly issues: unknown;
  constructor(type: string, issues: unknown) {
    super(`Block props validation failed for type "${type}".`);
    this.name = "BlockPropsValidationError";
    this.issues = issues;
  }
}

// ── Registry Map ─────────────────────────────────────────────────────────────
// Populated below after block imports to avoid circular-dependency issues.

export const BLOCK_REGISTRY = new Map<string, BlockRegistryEntry>();

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Look up a registry entry by block type.
 * Returns `undefined` for unknown types — callers decide how to handle.
 */
export function getBlock(type: string): BlockRegistryEntry | undefined {
  return BLOCK_REGISTRY.get(type);
}

/**
 * Validate `props` against the block's propsSchema, then invoke its Renderer.
 *
 * Throws `UnknownBlockTypeError` if `type` is not registered.
 * Throws `BlockPropsValidationError` if props fail schema validation.
 *
 * This is the ONLY code path that should invoke a Renderer — it guarantees
 * props are always validated before rendering (defense in depth).
 */
export async function renderBlock({
  type,
  props,
}: {
  type: string;
  props: Record<string, unknown>;
}): Promise<ReactNode> {
  const entry = BLOCK_REGISTRY.get(type);
  if (!entry) {
    throw new UnknownBlockTypeError(type);
  }

  const parsed = entry.propsSchema.safeParse(props);
  if (!parsed.success) {
    throw new BlockPropsValidationError(type, parsed.error.issues);
  }

  return entry.Renderer(parsed.data as Record<string, unknown>);
}

// ── Block registrations ──────────────────────────────────────────────────────
// Import each block module and register it. One import + one set() per block.

import { heroBlock } from "@/lib/content/blocks/hero";
import { richTextBlock } from "@/lib/content/blocks/rich-text";
import { productGridBlock } from "@/lib/content/blocks/product-grid";
import { imageTextSplitBlock } from "@/lib/content/blocks/image-text-split";
import { storyEditorialBlock } from "@/lib/content/blocks/story-editorial";
import { faqBlock } from "@/lib/content/blocks/faq";
import { newsletterSignupBlock } from "@/lib/content/blocks/newsletter-signup";
import { announcementBarBlock } from "@/lib/content/blocks/announcement-bar";
import { spacerBlock } from "@/lib/content/blocks/spacer";

BLOCK_REGISTRY.set(heroBlock.type, heroBlock);
BLOCK_REGISTRY.set(richTextBlock.type, richTextBlock);
BLOCK_REGISTRY.set(productGridBlock.type, productGridBlock);
BLOCK_REGISTRY.set(imageTextSplitBlock.type, imageTextSplitBlock);
BLOCK_REGISTRY.set(storyEditorialBlock.type, storyEditorialBlock);
BLOCK_REGISTRY.set(faqBlock.type, faqBlock);
BLOCK_REGISTRY.set(newsletterSignupBlock.type, newsletterSignupBlock);
BLOCK_REGISTRY.set(announcementBarBlock.type, announcementBarBlock);
BLOCK_REGISTRY.set(spacerBlock.type, spacerBlock);
