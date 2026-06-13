/**
 * lib/forms/derive-form-model.ts
 *
 * deriveFormModel() — converts a FormSchema + section layout map into a FormModel.
 * Pure TypeScript, no React.
 */

import type { FormField, FormModel, FormSchema, FormSection } from "./types";

/**
 * deriveFormModel(schema, sectionMap) → FormModel
 *
 * Converts a FormSchema into an ordered list of FormSection objects
 * for the generic renderer to consume. sectionMap declares which
 * field keys belong to which section and in what order.
 *
 * @throws {Error} if a key listed in sectionMap is not present in schema.fields
 *
 * Usage:
 *   const model = deriveFormModel(productFormSchema, [
 *     { title: "Details", fields: ["name", "slug", "detailsFabric"] },
 *     { title: "Story",   fields: ["storyTitle", "storyNarrative"] },
 *   ]);
 */
export function deriveFormModel(
  schema: FormSchema,
  sectionMap: Array<{
    title: string;
    description?: string;
    fields: string[];
  }>
): FormModel {
  const sections: FormSection[] = sectionMap.map((sectionDef) => {
    const fields: FormField[] = sectionDef.fields.map((key) => {
      const fieldDef = schema.fields[key];
      if (fieldDef === undefined) {
        throw new Error(
          `deriveFormModel: field key "${key}" not found in schema. ` +
            `Available keys: ${Object.keys(schema.fields).join(", ")}`
        );
      }
      return {
        key,
        meta: fieldDef.meta,
        zod: fieldDef.zod,
      };
    });

    const section: FormSection = {
      title: sectionDef.title,
      fields,
    };
    if (sectionDef.description !== undefined) {
      section.description = sectionDef.description;
    }
    return section;
  });

  return { sections };
}
