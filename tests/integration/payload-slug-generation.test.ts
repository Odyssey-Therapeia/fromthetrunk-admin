import { describe, expect, it } from "vitest";

import payloadConfigPromise from "@/payload.config";

const getCollectionConfig = async (slug: string) => {
  const payloadConfig = await payloadConfigPromise;
  const collection = payloadConfig.collections.find((item) => item.slug === slug);

  if (!collection) {
    throw new Error(`Collection "${slug}" not found in payload config.`);
  }

  return collection;
};

const getSlugHook = async (collectionSlug: string) => {
  const collection = await getCollectionConfig(collectionSlug);
  const slugRowField = collection.fields.find(
    (field) =>
      field.type === "row" &&
      Array.isArray(field.fields) &&
      field.fields.some((nestedField) => nestedField.name === "slug")
  );

  if (!slugRowField || !Array.isArray(slugRowField.fields)) {
    throw new Error(`Slug row field missing for "${collectionSlug}".`);
  }

  const generateSlugCheckbox = slugRowField.fields.find(
    (field) => field.name === "generateSlug"
  );

  const slugField = slugRowField.fields.find((field) => field.name === "slug");

  if (!generateSlugCheckbox || !slugField) {
    throw new Error(`Slug field setup incomplete for "${collectionSlug}".`);
  }

  const hook = generateSlugCheckbox.hooks?.beforeChange?.[0];

  if (!hook) {
    throw new Error(`Slug generation hook missing for "${collectionSlug}".`);
  }

  return { collection, hook, slugField };
};

const getBeforeValidateHook = async (collectionSlug: string) => {
  const collection = await getCollectionConfig(collectionSlug);
  const hook = collection.hooks?.beforeValidate?.[0];

  if (!hook) {
    throw new Error(`beforeValidate hook missing for "${collectionSlug}".`);
  }

  return { collection, hook };
};

describe("Payload slug generation", () => {
  it("generates product slug from name on create", async () => {
    const { collection, hook, slugField } = await getSlugHook("products");
    const data = { name: "Test Sari" };

    await hook({
      collection,
      data,
      operation: "create",
      req: {} as never,
      value: true,
    });

    expect(slugField.admin?.components?.Field?.clientProps?.useAsSlug).toBe("name");
    expect(data).toMatchObject({ slug: "test-sari" });
  });

  it("generates collection slug from name on create", async () => {
    const { collection, hook, slugField } = await getSlugHook("collections");
    const data = { name: "Festive Picks" };

    await hook({
      collection,
      data,
      operation: "create",
      req: {} as never,
      value: true,
    });

    expect(slugField.admin?.components?.Field?.clientProps?.useAsSlug).toBe("name");
    expect(data).toMatchObject({ slug: "festive-picks" });
  });

  it("preserves manually entered slug on create", async () => {
    const { collection, hook } = await getSlugHook("products");
    const data = { name: "Test Sari", slug: "custom-product-slug" };

    await hook({
      collection,
      data,
      operation: "create",
      req: {} as never,
      value: true,
    });

    expect(data).toMatchObject({ slug: "custom-product-slug" });
  });

  it("keeps existing product slug when publishing partial updates", async () => {
    const { hook } = await getBeforeValidateHook("products");
    const data = { _status: "published" };

    await hook({
      data,
      operation: "update",
      originalDoc: {
        _status: "draft",
        name: "Legacy Product Name",
        slug: "legacy-product-slug",
      },
    });

    expect(data).toMatchObject({ slug: "legacy-product-slug" });
  });

  it("keeps existing collection slug when publishing partial updates", async () => {
    const { hook } = await getBeforeValidateHook("collections");
    const data = { _status: "published" };

    await hook({
      data,
      operation: "update",
      originalDoc: {
        _status: "draft",
        name: "Legacy Collection Name",
        slug: "legacy-collection-slug",
      },
    });

    expect(data).toMatchObject({ slug: "legacy-collection-slug" });
  });
});
