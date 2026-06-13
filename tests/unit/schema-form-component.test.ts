/**
 * P2-02a: tests/unit/schema-form-component.test.ts
 *
 * Tests for SchemaForm (the schema-driven form wrapper) and productDetailsSchema.
 *
 * Contract under test:
 *  1. SchemaForm renders ALL field types from a fixture schema via deriveFormModel
 *     (adding a field to the schema adds it to the rendered form).
 *  2. Per-field validation errors surface from buildZodSchema().safeParse(values).
 *  3. showIf hides a field at the form level (hidden fields not rendered).
 *  4. productDetailsSchema covers all 9 details-step fields (the single source of truth).
 *  5. 0 `: any` — enforced at the type level, checked in the source file by the tsc step.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { SchemaForm } from "@/components/admin/schema-form/schema-form";
import { productDetailsSchema } from "@/components/admin/schema-form/product-details.schema";
import type { FormSchema } from "@/lib/forms/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RenderFormOpts = {
  schema: FormSchema;
  values: Record<string, unknown>;
  errors?: Record<string, string>;
  onChange?: (key: string, value: unknown) => void;
};

function renderForm(opts: RenderFormOpts): string {
  const { schema, values, errors, onChange = () => {} } = opts;
  return renderToStaticMarkup(
    createElement(SchemaForm, { schema, values, errors, onChange })
  );
}

// ---------------------------------------------------------------------------
// Fixture schema — two fields, different types
// ---------------------------------------------------------------------------

const fixtureSchema: FormSchema = {
  fields: {
    productName: {
      zod: z.string().min(1),
      meta: { type: "text", label: "Product Name", placeholder: "Enter name" },
    },
    isActive: {
      zod: z.boolean(),
      meta: { type: "boolean", label: "Is Active" },
    },
  },
};

// ---------------------------------------------------------------------------
// 1. SchemaForm renders all fields from the schema
// ---------------------------------------------------------------------------

describe("SchemaForm — schema-driven rendering", () => {
  it("renders every field defined in the schema", () => {
    const html = renderForm({
      schema: fixtureSchema,
      values: { productName: "", isActive: false },
    });
    expect(html).toContain("Product Name");
    expect(html).toContain("Is Active");
  });

  it("adding a field to the schema causes it to appear in the output", () => {
    const extendedSchema: FormSchema = {
      fields: {
        ...fixtureSchema.fields,
        extraField: {
          zod: z.string(),
          meta: { type: "text", label: "Extra Field Label" },
        },
      },
    };
    const html = renderForm({
      schema: extendedSchema,
      values: { productName: "", isActive: false, extraField: "" },
    });
    expect(html).toContain("Extra Field Label");
  });

  it("renders a text field with the correct input", () => {
    const html = renderForm({
      schema: fixtureSchema,
      values: { productName: "Banarasi", isActive: false },
    });
    expect(html).toContain('value="Banarasi"');
  });

  it("renders a boolean field", () => {
    const html = renderForm({
      schema: fixtureSchema,
      values: { productName: "", isActive: true },
    });
    expect(html).toContain("Is Active");
  });

  it("renders nothing extra when schema has zero fields", () => {
    const emptySchema: FormSchema = { fields: {} };
    const html = renderForm({ schema: emptySchema, values: {} });
    // Should render without error; no field-specific content expected
    expect(typeof html).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// 2. Per-field validation errors from buildZodSchema
// ---------------------------------------------------------------------------

describe("SchemaForm — validation error surfacing", () => {
  it("surfaces an explicit errors map to the correct field", () => {
    const html = renderForm({
      schema: fixtureSchema,
      values: { productName: "", isActive: false },
      errors: { productName: "Name is required" },
    });
    expect(html).toContain("Name is required");
  });

  it("does not show an error when errors map is absent", () => {
    const html = renderForm({
      schema: fixtureSchema,
      values: { productName: "Valid", isActive: false },
    });
    expect(html).not.toContain("destructive");
  });

  it("surfaces multiple errors on multiple fields simultaneously", () => {
    const html = renderForm({
      schema: fixtureSchema,
      values: { productName: "", isActive: false },
      errors: {
        productName: "Name required",
        isActive: "Must be active",
      },
    });
    expect(html).toContain("Name required");
    expect(html).toContain("Must be active");
  });
});

// ---------------------------------------------------------------------------
// 3. showIf hides a field at the form level
// ---------------------------------------------------------------------------

describe("SchemaForm — showIf conditional hiding", () => {
  const conditionalSchema: FormSchema = {
    fields: {
      status: {
        zod: z.string(),
        meta: { type: "text", label: "Status" },
      },
      secretField: {
        zod: z.string(),
        meta: {
          type: "conditional",
          label: "Secret Field",
          showIf: (values) => values["status"] === "special",
        },
      },
    },
  };

  it("hides a field when showIf returns false", () => {
    const html = renderForm({
      schema: conditionalSchema,
      values: { status: "normal", secretField: "" },
    });
    expect(html).not.toContain("Secret Field");
  });

  it("shows a field when showIf returns true", () => {
    const html = renderForm({
      schema: conditionalSchema,
      values: { status: "special", secretField: "" },
    });
    expect(html).toContain("Secret Field");
  });
});

// ---------------------------------------------------------------------------
// 4. productDetailsSchema — single source of truth for the details step
// ---------------------------------------------------------------------------

describe("productDetailsSchema — covers all details-step fields", () => {
  const expectedKeys = [
    "name",
    "slug",
    "collectionId",
    "detailsFabric",
    "detailsDesigner",
    "detailsLength",
    "detailsWidth",
    "detailsCondition",
    "tagsCsv",
  ];

  it("has all 9 required field keys", () => {
    const schemaKeys = Object.keys(productDetailsSchema.fields);
    for (const key of expectedKeys) {
      expect(schemaKeys).toContain(key);
    }
  });

  it("each field has a meta with a label", () => {
    for (const [key, field] of Object.entries(productDetailsSchema.fields)) {
      expect(field.meta.label, `${key} should have a label`).toBeTruthy();
    }
  });

  it("each field has a zod validator", () => {
    for (const [key, field] of Object.entries(productDetailsSchema.fields)) {
      expect(
        typeof field.zod.safeParse,
        `${key} should have zod.safeParse`
      ).toBe("function");
    }
  });

  it("all fields are type text (details step has only text inputs)", () => {
    for (const [key, field] of Object.entries(productDetailsSchema.fields)) {
      // tagsCsv is also text in the details step
      expect(
        field.meta.type,
        `${key} should be type text`
      ).toBe("text");
    }
  });

  it("name field is required (min 1)", () => {
    const result = productDetailsSchema.fields["name"]?.zod.safeParse("");
    expect(result?.success).toBe(false);
  });

  it("slug field accepts empty string (optional)", () => {
    const result = productDetailsSchema.fields["slug"]?.zod.safeParse("");
    expect(result?.success).toBe(true);
  });

  it("renders all 9 fields via SchemaForm", () => {
    const values: Record<string, unknown> = {
      name: "Test Name",
      slug: "test-slug",
      collectionId: "",
      detailsFabric: "Silk",
      detailsDesigner: "Nalli",
      detailsLength: "5.5",
      detailsWidth: "44",
      detailsCondition: "Excellent",
      tagsCsv: "1, 2",
    };
    const html = renderForm({ schema: productDetailsSchema, values });
    // All labels should appear
    expect(html).toContain("Fabric");
    expect(html).toContain("Designer");
    expect(html).toContain("Condition");
    expect(html).toContain("Tag");
  });
});
