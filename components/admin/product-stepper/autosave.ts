import type { ProductStepperValues } from "./types";

export const serializeStepperValues = (values: ProductStepperValues) =>
  JSON.stringify({
    ...values,
    imageMediaIds: [...values.imageMediaIds],
  });

export const hasStepperChanges = (
  values: ProductStepperValues,
  lastPersistedSnapshot: string,
) => serializeStepperValues(values) !== lastPersistedSnapshot;
