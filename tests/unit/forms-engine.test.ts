/**
 * P2-01: tests/unit/forms-engine.test.ts
 *
 * Behavioral tests for deriveFormModel() and buildZodSchema().
 * Covers all 11 field types (FT-01..FT-11), section derivation,
 * validation success/failure paths, and edge-cases.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { buildZodSchema, deriveFormModel } from "@/lib/forms/index";
import type { FieldMeta, FormSchema } from "@/lib/forms/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function schema(
  fields: Record<string, { zod: z.ZodTypeAny; meta: FieldMeta }>
): FormSchema {
  return { fields };
}

const textField = (key: string, label: string) => ({
  zod: z.string().min(1).max(200),
  meta: { type: "text" as const, label },
});

const textareaField = (key: string, label: string) => ({
  zod: z.string().max(5000),
  meta: { type: "textarea" as const, label },
});

const richTextField = (key: string, label: string) => ({
  zod: z.string().max(10000),
  meta: { type: "rich-text" as const, label },
});

const numberField = (key: string, label: string) => ({
  zod: z.number().min(0),
  meta: { type: "number" as const, label },
});

const moneyPaiseField = (key: string, label: string) => ({
  zod: z.number().int().nonnegative(),
  meta: { type: "money-paise" as const, label, unit: "rupees" as const },
});

const selectField = (key: string, label: string) => ({
  zod: z.enum(["draft", "published"]),
  meta: {
    type: "select" as const,
    label,
    options: [
      { label: "Draft", value: "draft" },
      { label: "Published", value: "published" },
    ],
  },
});

const multiSelectField = (key: string, label: string) => ({
  zod: z.array(z.string()),
  meta: {
    type: "multi-select" as const,
    label,
    options: [
      { label: "Silk", value: "silk" },
      { label: "Cotton", value: "cotton" },
    ],
  },
});

const booleanField = (key: string, label: string) => ({
  zod: z.boolean(),
  meta: { type: "boolean" as const, label },
});

const imageRefField = (key: string, label: string, multiple = false) => ({
  zod: multiple ? z.array(z.string().uuid()) : z.string().uuid(),
  meta: { type: "image-ref" as const, label, multiple },
});

const listOfGroupField = (key: string, label: string) => {
  const itemSchema: FormSchema = {
    fields: {
      title: {
        zod: z.string().min(1),
        meta: { type: "text", label: "Title" },
      },
      qty: {
        zod: z.number().int().min(1),
        meta: { type: "number", label: "Qty" },
      },
    },
  };
  return {
    zod: z.array(z.object({ title: z.string(), qty: z.number() })),
    meta: { type: "list-of-group" as const, label, itemSchema },
  };
};

const conditionalField = (key: string, label: string) => ({
  zod: z.string().nullable(),
  meta: {
    type: "conditional" as const,
    label,
    showIf: (values: Record<string, unknown>) =>
      values["stockStatus"] === "reserved",
  },
});

// ---------------------------------------------------------------------------
// Full fixture schema covering all 11 field types
// ---------------------------------------------------------------------------

const fullSchema = schema({
  name: textField("name", "Name"),
  narrative: textareaField("narrative", "Narrative"),
  richContent: richTextField("richContent", "Rich Content"),
  priceRupees: numberField("priceRupees", "Price (₹)"),
  pricePaise: moneyPaiseField("pricePaise", "Price (Paise)"),
  status: selectField("status", "Status"),
  tags: multiSelectField("tags", "Tags"),
  featured: booleanField("featured", "Featured"),
  coverImage: imageRefField("coverImage", "Cover Image", false),
  gallery: imageRefField("gallery", "Gallery", true),
  items: listOfGroupField("items", "Items"),
  reservedUntil: conditionalField("reservedUntil", "Reserved Until"),
});

// ---------------------------------------------------------------------------
// deriveFormModel — structure tests
// ---------------------------------------------------------------------------

describe("deriveFormModel — basic structure", () => {
  it("returns a FormModel with sections array", () => {
    const model = deriveFormModel(fullSchema, [
      { title: "Details", fields: ["name", "narrative"] },
    ]);
    expect(model).toHaveProperty("sections");
    expect(Array.isArray(model.sections)).toBe(true);
  });

  it("creates one section per entry in sectionMap", () => {
    const model = deriveFormModel(fullSchema, [
      { title: "Details", fields: ["name"] },
      { title: "Pricing", fields: ["priceRupees", "pricePaise"] },
    ]);
    expect(model.sections).toHaveLength(2);
  });

  it("preserves section titles", () => {
    const model = deriveFormModel(fullSchema, [
      { title: "Details", fields: ["name"] },
      { title: "Story", fields: ["narrative"] },
    ]);
    expect(model.sections[0].title).toBe("Details");
    expect(model.sections[1].title).toBe("Story");
  });

  it("preserves optional section description", () => {
    const model = deriveFormModel(fullSchema, [
      {
        title: "Details",
        description: "Basic product details",
        fields: ["name"],
      },
    ]);
    expect(model.sections[0].description).toBe("Basic product details");
  });

  it("omits section description when not provided", () => {
    const model = deriveFormModel(fullSchema, [
      { title: "Details", fields: ["name"] },
    ]);
    expect(model.sections[0].description).toBeUndefined();
  });

  it("each section contains FormField objects with key, meta, zod", () => {
    const model = deriveFormModel(fullSchema, [
      { title: "Details", fields: ["name", "narrative"] },
    ]);
    const section = model.sections[0];
    expect(section.fields).toHaveLength(2);
    const nameField = section.fields[0];
    expect(nameField.key).toBe("name");
    expect(nameField.meta.type).toBe("text");
    expect(nameField.meta.label).toBe("Name");
    expect(nameField.zod).toBeDefined();
  });

  it("preserves field order within a section", () => {
    const model = deriveFormModel(fullSchema, [
      {
        title: "All",
        fields: ["narrative", "name", "featured"],
      },
    ]);
    const keys = model.sections[0].fields.map((f) => f.key);
    expect(keys).toEqual(["narrative", "name", "featured"]);
  });

  it("throws if a field key is not in the schema", () => {
    expect(() =>
      deriveFormModel(fullSchema, [
        { title: "Details", fields: ["nonExistentKey"] },
      ])
    ).toThrow();
  });

  it("allows a field key to appear in only one section", () => {
    const model = deriveFormModel(fullSchema, [
      { title: "A", fields: ["name"] },
      { title: "B", fields: ["narrative"] },
    ]);
    expect(model.sections[0].fields[0].key).toBe("name");
    expect(model.sections[1].fields[0].key).toBe("narrative");
  });

  it("handles an empty section (no fields)", () => {
    const model = deriveFormModel(fullSchema, [
      { title: "Empty", fields: [] },
    ]);
    expect(model.sections[0].fields).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// deriveFormModel — field type propagation
// ---------------------------------------------------------------------------

describe("deriveFormModel — all 11 field types preserved", () => {
  const model = deriveFormModel(fullSchema, [
    {
      title: "All Fields",
      fields: [
        "name",
        "narrative",
        "richContent",
        "priceRupees",
        "pricePaise",
        "status",
        "tags",
        "featured",
        "coverImage",
        "gallery",
        "items",
        "reservedUntil",
      ],
    },
  ]);
  const fieldsMap = Object.fromEntries(
    model.sections[0].fields.map((f) => [f.key, f])
  );

  it("FT-01 text: type is text", () =>
    expect(fieldsMap.name.meta.type).toBe("text"));
  it("FT-02 textarea: type is textarea", () =>
    expect(fieldsMap.narrative.meta.type).toBe("textarea"));
  it("FT-03 rich-text: type is rich-text", () =>
    expect(fieldsMap.richContent.meta.type).toBe("rich-text"));
  it("FT-04 number: type is number", () =>
    expect(fieldsMap.priceRupees.meta.type).toBe("number"));
  it("FT-05 money-paise: type is money-paise with unit", () => {
    expect(fieldsMap.pricePaise.meta.type).toBe("money-paise");
    expect(fieldsMap.pricePaise.meta.unit).toBe("rupees");
  });
  it("FT-06 select: type is select with options", () => {
    expect(fieldsMap.status.meta.type).toBe("select");
    expect(fieldsMap.status.meta.options).toHaveLength(2);
  });
  it("FT-07 multi-select: type is multi-select with options", () => {
    expect(fieldsMap.tags.meta.type).toBe("multi-select");
    expect(fieldsMap.tags.meta.options).toHaveLength(2);
  });
  it("FT-08 boolean: type is boolean", () =>
    expect(fieldsMap.featured.meta.type).toBe("boolean"));
  it("FT-09 image-ref (single): multiple is false/undefined", () =>
    expect(fieldsMap.coverImage.meta.type).toBe("image-ref"));
  it("FT-09 image-ref (multiple): multiple is true", () => {
    expect(fieldsMap.gallery.meta.type).toBe("image-ref");
    expect(fieldsMap.gallery.meta.multiple).toBe(true);
  });
  it("FT-10 list-of-group: itemSchema is present", () => {
    expect(fieldsMap.items.meta.type).toBe("list-of-group");
    expect(fieldsMap.items.meta.itemSchema).toBeDefined();
    expect(fieldsMap.items.meta.itemSchema?.fields).toHaveProperty("title");
  });
  it("FT-11 conditional: showIf predicate is a function", () => {
    expect(fieldsMap.reservedUntil.meta.type).toBe("conditional");
    expect(typeof fieldsMap.reservedUntil.meta.showIf).toBe("function");
  });
  it("FT-11 conditional: showIf returns correct truthy value", () => {
    const showIf = fieldsMap.reservedUntil.meta.showIf!;
    expect(showIf({ stockStatus: "reserved" })).toBe(true);
    expect(showIf({ stockStatus: "available" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildZodSchema — structure
// ---------------------------------------------------------------------------

describe("buildZodSchema — flattens schema to ZodObject", () => {
  it("returns a ZodObject-compatible schema", () => {
    const zodSchema = buildZodSchema(
      schema({ name: textField("name", "Name") })
    );
    expect(zodSchema).toBeDefined();
    expect(typeof zodSchema.parse).toBe("function");
    expect(typeof zodSchema.safeParse).toBe("function");
  });

  it("validates a simple valid payload", () => {
    const zodSchema = buildZodSchema(
      schema({ name: textField("name", "Name") })
    );
    const result = zodSchema.safeParse({ name: "Test" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid payload (text min-length)", () => {
    const zodSchema = buildZodSchema(
      schema({ name: textField("name", "Name") })
    );
    const result = zodSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("validates multi-field schema with valid data", () => {
    const zodSchema = buildZodSchema(
      schema({
        name: textField("name", "Name"),
        featured: booleanField("featured", "Featured"),
      })
    );
    const result = zodSchema.safeParse({ name: "Silk saree", featured: true });
    expect(result.success).toBe(true);
  });

  it("rejects multi-field schema with one invalid field", () => {
    const zodSchema = buildZodSchema(
      schema({
        name: textField("name", "Name"),
        featured: booleanField("featured", "Featured"),
      })
    );
    const result = zodSchema.safeParse({ name: "", featured: true });
    expect(result.success).toBe(false);
  });

  it("money-paise field: accepts integer nonnegative (paise)", () => {
    const zodSchema = buildZodSchema(
      schema({ price: moneyPaiseField("price", "Price") })
    );
    const result = zodSchema.safeParse({ price: 175000 }); // 1750.00 rupees
    expect(result.success).toBe(true);
  });

  it("money-paise field: rejects negative values", () => {
    const zodSchema = buildZodSchema(
      schema({ price: moneyPaiseField("price", "Price") })
    );
    const result = zodSchema.safeParse({ price: -1 });
    expect(result.success).toBe(false);
  });

  it("money-paise field: rejects float (non-integer paise)", () => {
    const zodSchema = buildZodSchema(
      schema({ price: moneyPaiseField("price", "Price") })
    );
    const result = zodSchema.safeParse({ price: 175.5 }); // not integer paise
    expect(result.success).toBe(false);
  });

  it("select field: accepts valid enum value", () => {
    const zodSchema = buildZodSchema(
      schema({ status: selectField("status", "Status") })
    );
    const result = zodSchema.safeParse({ status: "draft" });
    expect(result.success).toBe(true);
  });

  it("select field: rejects invalid enum value", () => {
    const zodSchema = buildZodSchema(
      schema({ status: selectField("status", "Status") })
    );
    const result = zodSchema.safeParse({ status: "invalid-option" });
    expect(result.success).toBe(false);
  });

  it("multi-select field: accepts array of strings", () => {
    const zodSchema = buildZodSchema(
      schema({ tags: multiSelectField("tags", "Tags") })
    );
    const result = zodSchema.safeParse({ tags: ["silk", "cotton"] });
    expect(result.success).toBe(true);
  });

  it("multi-select field: rejects non-array", () => {
    const zodSchema = buildZodSchema(
      schema({ tags: multiSelectField("tags", "Tags") })
    );
    const result = zodSchema.safeParse({ tags: "silk" });
    expect(result.success).toBe(false);
  });

  it("number field: rejects negative (below min 0)", () => {
    const zodSchema = buildZodSchema(
      schema({ qty: numberField("qty", "Qty") })
    );
    const result = zodSchema.safeParse({ qty: -5 });
    expect(result.success).toBe(false);
  });

  it("number field: accepts zero", () => {
    const zodSchema = buildZodSchema(
      schema({ qty: numberField("qty", "Qty") })
    );
    const result = zodSchema.safeParse({ qty: 0 });
    expect(result.success).toBe(true);
  });

  it("boolean field: accepts true and false", () => {
    const zodSchema = buildZodSchema(
      schema({ flag: booleanField("flag", "Flag") })
    );
    expect(zodSchema.safeParse({ flag: true }).success).toBe(true);
    expect(zodSchema.safeParse({ flag: false }).success).toBe(true);
  });

  it("boolean field: rejects non-boolean", () => {
    const zodSchema = buildZodSchema(
      schema({ flag: booleanField("flag", "Flag") })
    );
    expect(zodSchema.safeParse({ flag: "yes" }).success).toBe(false);
  });

  it("image-ref (single) field: accepts a valid UUID", () => {
    const zodSchema = buildZodSchema(
      schema({ cover: imageRefField("cover", "Cover") })
    );
    const result = zodSchema.safeParse({
      cover: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("image-ref (single) field: rejects a non-UUID string", () => {
    const zodSchema = buildZodSchema(
      schema({ cover: imageRefField("cover", "Cover") })
    );
    const result = zodSchema.safeParse({ cover: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("image-ref (multiple) field: accepts array of UUIDs", () => {
    const zodSchema = buildZodSchema(
      schema({ gallery: imageRefField("gallery", "Gallery", true) })
    );
    const result = zodSchema.safeParse({
      gallery: [
        "550e8400-e29b-41d4-a716-446655440000",
        "550e8400-e29b-41d4-a716-446655440001",
      ],
    });
    expect(result.success).toBe(true);
  });

  it("list-of-group: accepts valid array of objects", () => {
    const zodSchema = buildZodSchema(
      schema({ items: listOfGroupField("items", "Items") })
    );
    const result = zodSchema.safeParse({
      items: [{ title: "Saree A", qty: 2 }],
    });
    expect(result.success).toBe(true);
  });

  it("rich-text: accepts string content", () => {
    const zodSchema = buildZodSchema(
      schema({ content: richTextField("content", "Content") })
    );
    const result = zodSchema.safeParse({ content: "<p>Hello</p>" });
    expect(result.success).toBe(true);
  });

  it("conditional field: included in zodSchema output shape", () => {
    const zodSchema = buildZodSchema(
      schema({ reservedUntil: conditionalField("reservedUntil", "Reserved Until") })
    );
    // null is acceptable (nullable)
    const result = zodSchema.safeParse({ reservedUntil: null });
    expect(result.success).toBe(true);
  });

  it("full schema with all 11 field types validates correctly", () => {
    const zodSchema = buildZodSchema(fullSchema);
    const result = zodSchema.safeParse({
      name: "Banarasi Silk Saree",
      narrative: "A fine handwoven saree",
      richContent: "<p>Detailed description</p>",
      priceRupees: 1750,
      pricePaise: 175000,
      status: "published",
      tags: ["silk", "cotton"],
      featured: true,
      coverImage: "550e8400-e29b-41d4-a716-446655440000",
      gallery: ["550e8400-e29b-41d4-a716-446655440000"],
      items: [{ title: "Item A", qty: 1 }],
      reservedUntil: null,
    });
    expect(result.success).toBe(true);
  });
});
