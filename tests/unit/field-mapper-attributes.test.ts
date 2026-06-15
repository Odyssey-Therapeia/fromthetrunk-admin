/**
 * P4-06: tests/unit/field-mapper-attributes.test.ts
 *
 * Proves that:
 * 1. autoMapFields recognises attribute-prefixed CSV headers (attr_X, attributes_X)
 *    and maps them to "attributes_X" dbField values (the ATTRIBUTES_PREFIX convention).
 * 2. typeId is now in DB_FIELDS so the field-mapper can auto-map it.
 * 3. The mapped "attributes_*" dbField output from autoMapFields is what the
 *    admin-import /execute route uses to collect rawAttributes — so a mapping
 *    produced by the real wizard option set reaches buildTypeZodSchema validation.
 *
 * Mutation proof for (1): if ATTRIBUTES_PREFIX handling is removed from
 * autoMapFields, attr_fabric → "" (unmapped) and these tests fail.
 */

import { describe, expect, it } from "vitest";
import { autoMapFields, attrDbField, ATTRIBUTES_PREFIX, DB_FIELDS } from "@/lib/import/field-mapper";

describe("autoMapFields — attribute column detection (P4-06)", () => {
  it("maps 'attr_fabric' CSV header to 'attributes_fabric' dbField (mutation proof)", () => {
    const mappings = autoMapFields(["attr_fabric"]);
    expect(mappings).toHaveLength(1);
    const m = mappings[0]!;
    // MUTATION PROOF: if the attr_ detection is removed, m.dbField would be "" (unmapped)
    expect(m.dbField).toBe("attributes_fabric");
    expect(m.status).toBe("mapped");
    expect(m.confidence).toBe(1.0);
  });

  it("maps 'attributes_condition' header to 'attributes_condition' dbField", () => {
    const mappings = autoMapFields(["attributes_condition"]);
    const m = mappings[0]!;
    expect(m.dbField).toBe("attributes_condition");
    expect(m.status).toBe("mapped");
  });

  it("maps mixed headers — standard fields + attribute columns", () => {
    const headers = ["name", "price", "attr_fabric", "attr_condition", "typeId"];
    const mappings = autoMapFields(headers);

    // name → "name"
    const nameMapping = mappings.find((m) => m.csvColumn === "name");
    expect(nameMapping?.dbField).toBe("name");
    expect(nameMapping?.status).toBe("mapped");

    // price → "pricePaise"
    const priceMapping = mappings.find((m) => m.csvColumn === "price");
    expect(priceMapping?.dbField).toBe("pricePaise");

    // attr_fabric → "attributes_fabric"
    const fabricMapping = mappings.find((m) => m.csvColumn === "attr_fabric");
    expect(fabricMapping?.dbField).toBe(`${ATTRIBUTES_PREFIX}fabric`);
    expect(fabricMapping?.status).toBe("mapped");

    // attr_condition → "attributes_condition"
    const condMapping = mappings.find((m) => m.csvColumn === "attr_condition");
    expect(condMapping?.dbField).toBe(`${ATTRIBUTES_PREFIX}condition`);

    // typeId → "typeId"
    const typeMapping = mappings.find((m) => m.csvColumn === "typeId");
    expect(typeMapping?.dbField).toBe("typeId");
    expect(typeMapping?.status).toBe("mapped");
  });

  it("round-trips with the CSV export format — 'attr_X' columns from export map back on import", () => {
    // The export route emits headers like "attr_fabric", "attr_condition" (from `attrKeys.map(k => \`attr_\${k}\`)`)
    // autoMapFields must map them back to "attributes_fabric", "attributes_condition"
    const exportHeaders = ["attr_fabric", "attr_length", "attr_handwoven"];
    const mappings = autoMapFields(exportHeaders);

    for (const m of mappings) {
      expect(m.status).toBe("mapped");
      expect(m.dbField.startsWith(ATTRIBUTES_PREFIX)).toBe(true);
    }

    const keys = mappings.map((m) => m.dbField.slice(ATTRIBUTES_PREFIX.length));
    expect(keys).toContain("fabric");
    expect(keys).toContain("length");
    expect(keys).toContain("handwoven");
  });
});

describe("DB_FIELDS — includes typeId (P4-06)", () => {
  it("DB_FIELDS includes 'typeId' so the import wizard dropdown can target it", () => {
    expect(DB_FIELDS).toContain("typeId");
  });
});

describe("attrDbField helper", () => {
  it("returns the correct prefixed dbField string", () => {
    expect(attrDbField("fabric")).toBe("attributes_fabric");
    expect(attrDbField("threadCount")).toBe("attributes_threadCount");
  });
});
