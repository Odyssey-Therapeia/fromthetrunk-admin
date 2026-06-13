import { describe, expect, it } from "vitest";

import {
  hasStepperChanges,
  serializeStepperValues,
} from "@/components/admin/product-stepper/autosave";
import { defaultStepperValues } from "@/components/admin/product-stepper/types";

describe("product stepper autosave helpers", () => {
  it("detects unchanged product values", () => {
    const snapshot = serializeStepperValues(defaultStepperValues);

    expect(hasStepperChanges(defaultStepperValues, snapshot)).toBe(false);
  });

  it("detects edits before autosave runs", () => {
    const snapshot = serializeStepperValues(defaultStepperValues);

    expect(
      hasStepperChanges(
        {
          ...defaultStepperValues,
          name: "Moonstone Cream Mauve Border Saree",
        },
        snapshot,
      ),
    ).toBe(true);
  });

  it("keeps image order in the change snapshot", () => {
    const first = serializeStepperValues({
      ...defaultStepperValues,
      imageMediaIds: ["image-a", "image-b"],
    });
    const second = serializeStepperValues({
      ...defaultStepperValues,
      imageMediaIds: ["image-b", "image-a"],
    });

    expect(first).not.toBe(second);
  });
});
