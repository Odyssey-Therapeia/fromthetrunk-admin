/**
 * P3-05: Block composer unit tests.
 *
 * Exercises the pure-logic helpers in lib/content/blocks/block-composer.ts:
 *   - addBlock: appends a new block with a stable clientId
 *   - removeBlock: removes a block by clientId
 *   - moveBlockUp: swaps block with the one above it
 *   - moveBlockDown: swaps block with the one below it
 *   - blocksToVersionPayload: strips clientId before persisting
 *   - blockCanBeAdded: enforces maxPerPage constraint from editorMeta
 *
 * Also exercises the page-editor route wiring (L3 e2e proxy):
 *   POST /api/v2/admin/pages/:id/versions accepts blocks array.
 *   The autosave behaviour is that POST /versions is called with the
 *   current blocks payload — exercised via the route harness.
 */

import { describe, expect, it, vi } from "vitest";

// Mock DB and product data layer — block-composer imports BLOCK_REGISTRY which
// imports product-grid which imports lib/data/products which needs DATABASE_URL.
vi.mock("@/lib/data/products", () => ({
  getFeaturedProducts: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
  getProductsByCollection: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
  getProducts: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
  getProductBySlug: vi.fn().mockResolvedValue(null),
  getProductsByIds: vi.fn().mockResolvedValue([]),
}));

// Mock RSC component deps not available in node env
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/product/product-card", () => ({ ProductCard: () => null }));
vi.mock("@/lib/media/resolve-media-url", () => ({ resolveMediaURL: () => null }));

import {
  addBlock,
  removeBlock,
  moveBlockUp,
  moveBlockDown,
  blocksToVersionPayload,
  blockCanBeAdded,
  type ComposerBlock,
} from "@/lib/content/blocks/block-composer";

// ── Pure composer helpers ─────────────────────────────────────────────────────

describe("addBlock", () => {
  it("appends a new block to an empty list", () => {
    const result = addBlock([], "hero", { headline: "Welcome" });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("hero");
    expect(result[0].props).toMatchObject({ headline: "Welcome" });
    expect(typeof result[0].clientId).toBe("string");
    expect(result[0].clientId.length).toBeGreaterThan(0);
  });

  it("appends to the end of an existing list", () => {
    const initial: ComposerBlock[] = [
      { clientId: "a", type: "hero", props: { headline: "H" } },
    ];
    const result = addBlock(initial, "rich-text", { body: "Body" });
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("hero");
    expect(result[1].type).toBe("rich-text");
  });

  it("assigns unique clientIds for every block", () => {
    let blocks: ComposerBlock[] = [];
    blocks = addBlock(blocks, "rich-text", { body: "A" });
    blocks = addBlock(blocks, "rich-text", { body: "B" });
    blocks = addBlock(blocks, "rich-text", { body: "C" });
    const ids = blocks.map((b) => b.clientId);
    expect(new Set(ids).size).toBe(3);
  });

  it("does NOT mutate the original array", () => {
    const initial: ComposerBlock[] = [];
    addBlock(initial, "hero", { headline: "H" });
    expect(initial).toHaveLength(0);
  });
});

describe("removeBlock", () => {
  it("removes the block with the matching clientId", () => {
    const blocks: ComposerBlock[] = [
      { clientId: "x", type: "hero", props: { headline: "H" } },
      { clientId: "y", type: "rich-text", props: { body: "B" } },
    ];
    const result = removeBlock(blocks, "x");
    expect(result).toHaveLength(1);
    expect(result[0].clientId).toBe("y");
  });

  it("returns the same list when clientId is not found", () => {
    const blocks: ComposerBlock[] = [
      { clientId: "x", type: "hero", props: { headline: "H" } },
    ];
    const result = removeBlock(blocks, "nonexistent");
    expect(result).toHaveLength(1);
  });

  it("does NOT mutate the original array", () => {
    const blocks: ComposerBlock[] = [
      { clientId: "x", type: "hero", props: { headline: "H" } },
    ];
    removeBlock(blocks, "x");
    expect(blocks).toHaveLength(1);
  });
});

describe("moveBlockUp", () => {
  it("swaps the block at index 1 with index 0", () => {
    const blocks: ComposerBlock[] = [
      { clientId: "a", type: "hero", props: {} },
      { clientId: "b", type: "rich-text", props: { body: "B" } },
      { clientId: "c", type: "product-grid", props: { source: "featured" } },
    ];
    const result = moveBlockUp(blocks, "b");
    expect(result[0].clientId).toBe("b");
    expect(result[1].clientId).toBe("a");
    expect(result[2].clientId).toBe("c");
  });

  it("is a no-op for the first block", () => {
    const blocks: ComposerBlock[] = [
      { clientId: "a", type: "hero", props: {} },
      { clientId: "b", type: "rich-text", props: { body: "B" } },
    ];
    const result = moveBlockUp(blocks, "a");
    expect(result[0].clientId).toBe("a");
    expect(result[1].clientId).toBe("b");
  });

  it("does NOT mutate the original array", () => {
    const blocks: ComposerBlock[] = [
      { clientId: "a", type: "hero", props: {} },
      { clientId: "b", type: "rich-text", props: { body: "B" } },
    ];
    moveBlockUp(blocks, "b");
    expect(blocks[0].clientId).toBe("a");
  });
});

describe("moveBlockDown", () => {
  it("swaps the block at index 0 with index 1", () => {
    const blocks: ComposerBlock[] = [
      { clientId: "a", type: "hero", props: {} },
      { clientId: "b", type: "rich-text", props: { body: "B" } },
      { clientId: "c", type: "product-grid", props: { source: "featured" } },
    ];
    const result = moveBlockDown(blocks, "a");
    expect(result[0].clientId).toBe("b");
    expect(result[1].clientId).toBe("a");
    expect(result[2].clientId).toBe("c");
  });

  it("is a no-op for the last block", () => {
    const blocks: ComposerBlock[] = [
      { clientId: "a", type: "hero", props: {} },
      { clientId: "b", type: "rich-text", props: { body: "B" } },
    ];
    const result = moveBlockDown(blocks, "b");
    expect(result[0].clientId).toBe("a");
    expect(result[1].clientId).toBe("b");
  });

  it("does NOT mutate the original array", () => {
    const blocks: ComposerBlock[] = [
      { clientId: "a", type: "hero", props: {} },
      { clientId: "b", type: "rich-text", props: { body: "B" } },
    ];
    moveBlockDown(blocks, "a");
    expect(blocks[0].clientId).toBe("a");
  });
});

describe("blocksToVersionPayload", () => {
  it("strips clientId from each block", () => {
    const blocks: ComposerBlock[] = [
      { clientId: "abc-123", type: "hero", props: { headline: "H" } },
      { clientId: "def-456", type: "rich-text", props: { body: "B" } },
    ];
    const payload = blocksToVersionPayload(blocks);
    expect(payload).toHaveLength(2);
    expect((payload[0] as Record<string, unknown>).clientId).toBeUndefined();
    expect((payload[0] as Record<string, unknown>).type).toBe("hero");
    expect((payload[1] as Record<string, unknown>).clientId).toBeUndefined();
  });

  it("preserves the order and props of each block", () => {
    const blocks: ComposerBlock[] = [
      { clientId: "1", type: "hero", props: { headline: "Title" } },
      { clientId: "2", type: "rich-text", props: { body: "Content" } },
      { clientId: "3", type: "product-grid", props: { source: "featured" } },
    ];
    const payload = blocksToVersionPayload(blocks);
    const types = payload.map((b) => (b as Record<string, unknown>).type);
    expect(types).toEqual(["hero", "rich-text", "product-grid"]);
  });

  it("does NOT mutate the original blocks array", () => {
    const blocks: ComposerBlock[] = [
      { clientId: "a", type: "hero", props: { headline: "H" } },
    ];
    blocksToVersionPayload(blocks);
    expect(blocks[0].clientId).toBe("a");
  });
});

describe("blockCanBeAdded", () => {
  it("returns true when no maxPerPage constraint exists", () => {
    // rich-text has no maxPerPage
    const blocks: ComposerBlock[] = [
      { clientId: "a", type: "rich-text", props: { body: "B" } },
      { clientId: "b", type: "rich-text", props: { body: "C" } },
    ];
    expect(blockCanBeAdded(blocks, "rich-text")).toBe(true);
  });

  it("returns true when count < maxPerPage", () => {
    // hero has maxPerPage=1; no hero blocks yet
    const blocks: ComposerBlock[] = [
      { clientId: "a", type: "rich-text", props: { body: "B" } },
    ];
    expect(blockCanBeAdded(blocks, "hero")).toBe(true);
  });

  it("returns false when count >= maxPerPage", () => {
    // hero has maxPerPage=1; one hero already present
    const blocks: ComposerBlock[] = [
      { clientId: "a", type: "hero", props: { headline: "H" } },
    ];
    expect(blockCanBeAdded(blocks, "hero")).toBe(false);
  });

  it("returns true for an unknown block type (no registry entry, no constraint)", () => {
    const blocks: ComposerBlock[] = [];
    expect(blockCanBeAdded(blocks, "unknown-future-type")).toBe(true);
  });
});

// ── L3 e2e: build 3 blocks, reorder, save via route harness ─────────────────

import { createRouteHarness } from "../helpers/route-harness";
import { registerPagesRoutes } from "@/api/hono/routes/pages";
import { createInMemoryContentStore } from "@/lib/adapters/drizzle-content-store";

describe("L3 e2e: block composer → autosave → version persisted", () => {
  it("builds 3 blocks, reorders, saves as a new version, version has correct block order", async () => {
    const store = createInMemoryContentStore();
    const harness = createRouteHarness({
      register: (app) => registerPagesRoutes(app, store),
      authUser: { id: "admin-1", email: "admin@example.com", role: "admin" },
    });

    // Step 1: Create a page
    const createRes = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "test-composer-page", title: "Composer Test" }),
    });
    expect(createRes.status).toBe(201);
    const page = (await createRes.json()) as { id: string };

    // Step 2: Simulate block composer building 3 blocks and reordering
    let blocks: ComposerBlock[] = [];
    blocks = addBlock(blocks, "hero", { headline: "Welcome" });
    blocks = addBlock(blocks, "rich-text", { body: "About us text" });
    blocks = addBlock(blocks, "product-grid", { source: "featured" });

    // Reorder: move rich-text to the top
    blocks = moveBlockUp(blocks, blocks[1].clientId);

    // Verify order in composer state
    expect(blocks[0].type).toBe("rich-text");
    expect(blocks[1].type).toBe("hero");
    expect(blocks[2].type).toBe("product-grid");

    // Step 3: Autosave — POST the blocks as a new version
    const payload = blocksToVersionPayload(blocks);
    const versionRes = await harness.request(`/${page.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: payload }),
    });

    expect(versionRes.status).toBe(201);
    const version = (await versionRes.json()) as {
      id: string;
      blocks: Array<{ type: string; props: Record<string, unknown> }>;
    };

    // Step 4: Confirm block order is persisted correctly
    expect(version.blocks).toHaveLength(3);
    const types = version.blocks.map((b) => b.type);
    expect(types).toEqual(["rich-text", "hero", "product-grid"]);

    // clientId must NOT appear in persisted data
    const persisted = version.blocks as Array<Record<string, unknown>>;
    expect(persisted[0].clientId).toBeUndefined();
  });

  it("GET /versions returns the saved version after autosave", async () => {
    const store = createInMemoryContentStore();
    const harness = createRouteHarness({
      register: (app) => registerPagesRoutes(app, store),
      authUser: { id: "admin-1", email: "admin@example.com", role: "admin" },
    });

    const createRes = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "autosave-page", title: "Autosave Test" }),
    });
    const page = (await createRes.json()) as { id: string };

    let blocks: ComposerBlock[] = [];
    blocks = addBlock(blocks, "hero", { headline: "Hello" });
    blocks = addBlock(blocks, "rich-text", { body: "Intro" });

    await harness.request(`/${page.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: blocksToVersionPayload(blocks) }),
    });

    const versionsRes = await harness.request(`/${page.id}/versions`);
    expect(versionsRes.status).toBe(200);
    const versions = (await versionsRes.json()) as Array<{
      blocks: Array<{ type: string }>;
    }>;

    expect(versions).toHaveLength(1);
    expect(versions[0].blocks).toHaveLength(2);
    expect(versions[0].blocks[0].type).toBe("hero");
    expect(versions[0].blocks[1].type).toBe("rich-text");
  });
});
