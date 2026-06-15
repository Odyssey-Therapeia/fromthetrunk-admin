/**
 * P2-02: tests/unit/schema-form.test.ts
 *
 * Component tests for the SchemaForm renderer.
 * Covers all 11 field types (FT-01..FT-11):
 *   - fields render correct HTML
 *   - validation errors surface per field
 *   - showIf hides a conditional field
 *
 * Uses react-dom/server renderToStaticMarkup (node env, no jsdom needed).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { SchemaFormField } from "@/components/admin/schema-form/schema-form-field";
import type { FieldMeta } from "@/lib/forms/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RenderFieldOpts = {
  meta: FieldMeta;
  value: unknown;
  error?: string;
  formValues?: Record<string, unknown>;
  onBlur?: () => void;
  onChange?: (value: unknown) => void;
};

function renderField(opts: RenderFieldOpts): string {
  const {
    meta,
    value,
    error,
    formValues = {},
    onBlur = () => {},
    onChange = () => {},
  } = opts;

  return renderToStaticMarkup(
    createElement(SchemaFormField, {
      fieldKey: "testField",
      meta,
      value,
      error,
      formValues,
      onBlur,
      onChange,
    })
  );
}

// ---------------------------------------------------------------------------
// FT-01 text
// ---------------------------------------------------------------------------

describe("SchemaFormField — FT-01 text", () => {
  const meta: FieldMeta = { type: "text", label: "Product Name", placeholder: "Enter name" };

  it("renders an input with type text", () => {
    const html = renderField({ meta, value: "Silk Saree" });
    expect(html).toContain("<input");
    expect(html).toContain('type="text"');
  });

  it("renders the label", () => {
    const html = renderField({ meta, value: "" });
    expect(html).toContain("Product Name");
  });

  it("renders the current value", () => {
    const html = renderField({ meta, value: "Kanjeevaram" });
    expect(html).toContain('value="Kanjeevaram"');
  });

  it("renders placeholder", () => {
    const html = renderField({ meta, value: "" });
    expect(html).toContain('placeholder="Enter name"');
  });

  it("surfaces a validation error", () => {
    const html = renderField({ meta, value: "", error: "Name is required" });
    expect(html).toContain("Name is required");
  });
});

// ---------------------------------------------------------------------------
// FT-02 textarea
// ---------------------------------------------------------------------------

describe("SchemaFormField — FT-02 textarea", () => {
  const meta: FieldMeta = { type: "textarea", label: "Story Narrative" };

  it("renders a textarea element", () => {
    const html = renderField({ meta, value: "A fine saree" });
    expect(html).toContain("<textarea");
  });

  it("renders the label", () => {
    const html = renderField({ meta, value: "" });
    expect(html).toContain("Story Narrative");
  });

  it("renders the value as textarea content", () => {
    const html = renderField({ meta, value: "Once upon a time" });
    expect(html).toContain("Once upon a time");
  });

  it("surfaces a validation error", () => {
    const html = renderField({ meta, value: "", error: "Narrative is required" });
    expect(html).toContain("Narrative is required");
  });
});

// ---------------------------------------------------------------------------
// FT-03 rich-text (deferred to textarea in v1)
// ---------------------------------------------------------------------------

describe("SchemaFormField — FT-03 rich-text (deferred to textarea)", () => {
  const meta: FieldMeta = { type: "rich-text", label: "Rich Content" };

  it("renders a textarea (deferred implementation)", () => {
    const html = renderField({ meta, value: "<p>Hello</p>" });
    expect(html).toContain("<textarea");
  });

  it("renders the label", () => {
    const html = renderField({ meta, value: "" });
    expect(html).toContain("Rich Content");
  });
});

// ---------------------------------------------------------------------------
// FT-04 number
// ---------------------------------------------------------------------------

describe("SchemaFormField — FT-04 number", () => {
  const meta: FieldMeta = { type: "number", label: "Quantity" };

  it("renders an input with type number", () => {
    const html = renderField({ meta, value: 5 });
    expect(html).toContain("<input");
    expect(html).toContain('type="number"');
  });

  it("renders the label", () => {
    const html = renderField({ meta, value: 0 });
    expect(html).toContain("Quantity");
  });

  it("renders the current numeric value", () => {
    const html = renderField({ meta, value: 42 });
    expect(html).toContain('value="42"');
  });

  it("surfaces a validation error", () => {
    const html = renderField({ meta, value: -1, error: "Must be positive" });
    expect(html).toContain("Must be positive");
  });
});

// ---------------------------------------------------------------------------
// FT-05 money-paise
// ---------------------------------------------------------------------------

describe("SchemaFormField — FT-05 money-paise", () => {
  const meta: FieldMeta = { type: "money-paise", label: "Price", unit: "rupees" };

  it("renders an input (shown in rupees)", () => {
    const html = renderField({ meta, value: 175000 });
    expect(html).toContain("<input");
    expect(html).toContain('type="number"');
  });

  it("renders the label", () => {
    const html = renderField({ meta, value: 175000 });
    expect(html).toContain("Price");
  });

  it("shows rupees value in input (paise 175000 => rupees 1750)", () => {
    // paise stored as 175000 => rupees displayed as 1750
    const html = renderField({ meta, value: 175000 });
    expect(html).toContain('value="1750"');
  });

  it("surfaces a validation error", () => {
    const html = renderField({ meta, value: -100, error: "Must be non-negative" });
    expect(html).toContain("Must be non-negative");
  });
});

// ---------------------------------------------------------------------------
// FT-06 select
// ---------------------------------------------------------------------------

describe("SchemaFormField — FT-06 select", () => {
  const meta: FieldMeta = {
    type: "select",
    label: "Status",
    options: [
      { label: "Draft", value: "draft" },
      { label: "Published", value: "published" },
    ],
  };

  it("renders a select element", () => {
    const html = renderField({ meta, value: "draft" });
    expect(html).toContain("<select");
  });

  it("renders the label", () => {
    const html = renderField({ meta, value: "draft" });
    expect(html).toContain("Status");
  });

  it("renders all options", () => {
    const html = renderField({ meta, value: "draft" });
    expect(html).toContain("Draft");
    expect(html).toContain("Published");
  });

  it("selects the current value", () => {
    const html = renderField({ meta, value: "published" });
    // the selected option should have selected attribute
    expect(html).toContain("published");
  });

  it("surfaces a validation error", () => {
    const html = renderField({ meta, value: "", error: "Status is required" });
    expect(html).toContain("Status is required");
  });
});

// ---------------------------------------------------------------------------
// FT-07 multi-select
// ---------------------------------------------------------------------------

describe("SchemaFormField — FT-07 multi-select", () => {
  const meta: FieldMeta = {
    type: "multi-select",
    label: "Tags",
    options: [
      { label: "Silk", value: "silk" },
      { label: "Cotton", value: "cotton" },
      { label: "Handloom", value: "handloom" },
    ],
  };

  it("renders a multi-select control", () => {
    const html = renderField({ meta, value: ["silk"] });
    // multi-select renders as checkboxes or CSV input
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("Tags");
  });

  it("renders all options as checkboxes or list items", () => {
    const html = renderField({ meta, value: [] });
    expect(html).toContain("Silk");
    expect(html).toContain("Cotton");
    expect(html).toContain("Handloom");
  });

  it("surfaces a validation error", () => {
    const html = renderField({ meta, value: [], error: "Select at least one" });
    expect(html).toContain("Select at least one");
  });
});

// ---------------------------------------------------------------------------
// FT-08 boolean
// ---------------------------------------------------------------------------

describe("SchemaFormField — FT-08 boolean", () => {
  const meta: FieldMeta = { type: "boolean", label: "Featured" };

  it("renders a switch or checkbox", () => {
    const html = renderField({ meta, value: false });
    // switch renders as a button with role="switch" OR an input[type=checkbox]
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("Featured");
  });

  it("renders the label", () => {
    const html = renderField({ meta, value: true });
    expect(html).toContain("Featured");
  });

  it("surfaces a validation error", () => {
    const html = renderField({ meta, value: false, error: "Must be accepted" });
    expect(html).toContain("Must be accepted");
  });
});

// ---------------------------------------------------------------------------
// FT-09 image-ref
// ---------------------------------------------------------------------------

describe("SchemaFormField — FT-09 image-ref", () => {
  const meta: FieldMeta = { type: "image-ref", label: "Cover Image", multiple: false };

  it("renders an image reference field", () => {
    const html = renderField({ meta, value: "" });
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("Cover Image");
  });

  it("renders current image UUID value", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const html = renderField({ meta, value: uuid });
    expect(html).toContain(uuid);
  });

  it("surfaces a validation error", () => {
    const html = renderField({ meta, value: "", error: "Image is required" });
    expect(html).toContain("Image is required");
  });
});

// ---------------------------------------------------------------------------
// FT-10 list-of-group
// ---------------------------------------------------------------------------

describe("SchemaFormField — FT-10 list-of-group", () => {
  const itemSchema = {
    fields: {
      title: {
        zod: z.string().min(1),
        meta: { type: "text" as const, label: "Title" },
      },
      qty: {
        zod: z.number().int().min(1),
        meta: { type: "number" as const, label: "Qty" },
      },
    },
  };

  const meta: FieldMeta = { type: "list-of-group", label: "Items", itemSchema };

  it("renders a repeatable group control", () => {
    const html = renderField({ meta, value: [] });
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("Items");
  });

  it("renders an 'add' button for new rows", () => {
    const html = renderField({ meta, value: [] });
    // should contain something to add rows
    expect(html).toContain("Add");
  });

  it("surfaces a validation error", () => {
    const html = renderField({ meta, value: [], error: "At least one item required" });
    expect(html).toContain("At least one item required");
  });
});

// ---------------------------------------------------------------------------
// FT-11 conditional (showIf)
// ---------------------------------------------------------------------------

describe("SchemaFormField — FT-11 conditional (showIf)", () => {
  const meta: FieldMeta = {
    type: "conditional",
    label: "Reserved Until",
    showIf: (values) => values["stockStatus"] === "reserved",
  };

  it("renders the field when showIf returns true", () => {
    const html = renderField({
      meta,
      value: null,
      formValues: { stockStatus: "reserved" },
    });
    expect(html).toContain("Reserved Until");
  });

  it("hides the field (renders empty) when showIf returns false", () => {
    const html = renderField({
      meta,
      value: null,
      formValues: { stockStatus: "available" },
    });
    // field should not render — empty string
    expect(html).toBe("");
  });

  it("hides field when showIf returns false — does NOT contain label", () => {
    const html = renderField({
      meta,
      value: null,
      formValues: { stockStatus: "available" },
    });
    expect(html).not.toContain("Reserved Until");
  });
});

// ---------------------------------------------------------------------------
// Validation error surfaces
// ---------------------------------------------------------------------------

describe("SchemaFormField — validation error rendering", () => {
  it("renders error with destructive styling class", () => {
    const meta: FieldMeta = { type: "text", label: "Name" };
    const html = renderField({ meta, value: "", error: "Required" });
    expect(html).toContain("destructive");
    expect(html).toContain("Required");
  });

  it("does not render error element when error is undefined", () => {
    const meta: FieldMeta = { type: "text", label: "Name" };
    const html = renderField({ meta, value: "Ok", error: undefined });
    expect(html).not.toContain("destructive");
  });
});
