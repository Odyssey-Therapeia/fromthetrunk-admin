/**
 * P3-05: Block composer — pure-logic helpers for the page editor.
 *
 * All functions are pure (no side effects, no mutation) so they are trivially
 * testable and safe to call from any context.
 *
 * ComposerBlock wraps a persisted block entry with a client-side-only `clientId`
 * used as a stable React key for the ordered list.  The clientId MUST be stripped
 * before persisting (see `blocksToVersionPayload`).
 *
 * The block list model mirrors Shopify's "section list": an ordered array of
 * typed blocks, each with its own props.  No free-form canvas.
 */

import { BLOCK_REGISTRY } from "@/lib/content/blocks/registry";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A block as it exists in the composer's in-memory state.
 * `clientId` is UI-only (stable React key); it is NOT persisted.
 */
export type ComposerBlock = {
  /** Client-side-only stable key. Never sent to the API. */
  clientId: string;
  /** Discriminant matching a BLOCK_REGISTRY entry. */
  type: string;
  /** Block-specific props. Validated by propsSchema on save. */
  props: Record<string, unknown>;
};

/**
 * Shape of a persisted block (clientId stripped).
 * This is what goes into `page_versions.blocks`.
 */
export type PersistedBlock = {
  type: string;
  props: Record<string, unknown>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a short unique ID for clientId assignment. */
function newClientId(): string {
  return crypto.randomUUID();
}

// ── Core mutations (all pure — return new arrays) ─────────────────────────────

/**
 * Append a new block of `type` with the given `props` to the end of the list.
 * Returns a NEW array; the original is not mutated.
 */
export function addBlock(
  blocks: ComposerBlock[],
  type: string,
  props: Record<string, unknown> = {}
): ComposerBlock[] {
  const newBlock: ComposerBlock = {
    clientId: newClientId(),
    type,
    props,
  };
  return [...blocks, newBlock];
}

/**
 * Remove the block identified by `clientId` from the list.
 * Returns a NEW array; the original is not mutated.
 * If `clientId` is not found, returns a shallow copy of the original.
 */
export function removeBlock(
  blocks: ComposerBlock[],
  clientId: string
): ComposerBlock[] {
  return blocks.filter((b) => b.clientId !== clientId);
}

/**
 * Move the block identified by `clientId` one position earlier in the list.
 * No-op if the block is already first.
 * Returns a NEW array; the original is not mutated.
 */
export function moveBlockUp(
  blocks: ComposerBlock[],
  clientId: string
): ComposerBlock[] {
  const index = blocks.findIndex((b) => b.clientId === clientId);
  if (index <= 0) return [...blocks];

  const next = [...blocks];
  const temp = next[index - 1];
  next[index - 1] = next[index];
  next[index] = temp;
  return next;
}

/**
 * Move the block identified by `clientId` one position later in the list.
 * No-op if the block is already last.
 * Returns a NEW array; the original is not mutated.
 */
export function moveBlockDown(
  blocks: ComposerBlock[],
  clientId: string
): ComposerBlock[] {
  const index = blocks.findIndex((b) => b.clientId === clientId);
  if (index < 0 || index >= blocks.length - 1) return [...blocks];

  const next = [...blocks];
  const temp = next[index + 1];
  next[index + 1] = next[index];
  next[index] = temp;
  return next;
}

/**
 * Update the props of a single block identified by `clientId`.
 * Returns a NEW array; the original is not mutated.
 */
export function updateBlockProps(
  blocks: ComposerBlock[],
  clientId: string,
  props: Record<string, unknown>
): ComposerBlock[] {
  return blocks.map((b) =>
    b.clientId === clientId ? { ...b, props } : b
  );
}

// ── Serialisation ─────────────────────────────────────────────────────────────

/**
 * Convert the composer block list to the API payload for POST /pages/:id/versions.
 * Strips the client-side `clientId` from each block.
 *
 * The result is safe to pass as `blocks` in the createVersionBodySchema.
 */
export function blocksToVersionPayload(
  blocks: ComposerBlock[]
): PersistedBlock[] {
  return blocks.map(({ type, props }) => ({ type, props }));
}

/**
 * Convert persisted blocks (from a loaded page version) to ComposerBlocks,
 * assigning fresh clientIds so the editor can track them.
 */
export function versionPayloadToBlocks(
  persisted: PersistedBlock[]
): ComposerBlock[] {
  return persisted.map((b) => ({
    clientId: newClientId(),
    type: b.type,
    props: b.props,
  }));
}

// ── Constraint helpers ────────────────────────────────────────────────────────

/**
 * Returns true if a block of `type` can be added given the current list.
 * Enforces `editorMeta.maxPerPage` from the registry.
 * Returns true for unknown types (no constraint available).
 */
export function blockCanBeAdded(
  blocks: ComposerBlock[],
  type: string
): boolean {
  const entry = BLOCK_REGISTRY.get(type);
  if (!entry) return true;

  const { maxPerPage } = entry.editorMeta;
  if (maxPerPage === undefined) return true;

  const currentCount = blocks.filter((b) => b.type === type).length;
  return currentCount < maxPerPage;
}
