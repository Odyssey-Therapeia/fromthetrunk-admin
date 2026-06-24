"use client";

import type {
  FormAsyncValidateOrFn,
  FormValidateOrFn,
  ReactFormExtendedApi,
} from "@tanstack/react-form";
import { useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { slugify } from "@/lib/utils";

import { logEvent, useRenderLog } from "./_render-log";
import { TagPicker } from "./tag-picker";
import type { ProductStepperValues } from "./types";

type ProductStepperSyncValidator =
  | FormValidateOrFn<ProductStepperValues>
  | undefined;
type ProductStepperAsyncValidator =
  | FormAsyncValidateOrFn<ProductStepperValues>
  | undefined;

type ProductStepperForm = ReactFormExtendedApi<
  ProductStepperValues,
  ProductStepperSyncValidator,
  ProductStepperSyncValidator,
  ProductStepperAsyncValidator,
  ProductStepperSyncValidator,
  ProductStepperAsyncValidator,
  ProductStepperSyncValidator,
  ProductStepperAsyncValidator,
  ProductStepperSyncValidator,
  ProductStepperAsyncValidator,
  ProductStepperAsyncValidator,
  unknown
>;

type StepDetailsProps = {
  form: ProductStepperForm;
};

type CollectionOption = {
  id: string;
  name?: null | string;
  slug?: null | string;
  title?: null | string;
};

type CollectionsResponse = CollectionOption[];

const fabricOptions = [
  "Georgette",
  "Cotton",
  "Kanjeevaram",
  "Silk",
  "Kota Cotton",
  "Chiffon",
  "Kanjeevaram Mix",
  "Organza",
  "Cotton Silk",
] as const;

const conditionOptions = [
  "Pristine",
  "Excellent",
  "Very Good",
  "Good",
  "Fair",
  "Needs Restoration",
] as const;

const noCollectionValue = "__no_collection__";
const noFabricValue = "__no_fabric__";
const noConditionValue = "__no_condition__";

const parseTagIds = (csv: string): number[] =>
  csv
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);

const getCollectionLabel = (collection: CollectionOption) =>
  collection.title ||
  collection.name ||
  collection.slug ||
  `Collection ${collection.id.slice(0, 8)}`;

async function fetchCollections() {
  const response = await fetch("/api/v2/collections", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Could not load collections.");
  }

  return (await response.json()) as CollectionsResponse;
}

export function StepDetails({ form }: StepDetailsProps) {
  useRenderLog("StepDetails");

  const formValues = useStore(form.store, (state) => state.values);

  const collectionsQuery = useQuery({
    queryKey: ["admin-product-stepper-collections"],
    queryFn: fetchCollections,
  });

  const collections = collectionsQuery.data ?? [];

  type DetailsTextFieldKey =
    | "collectionId"
    | "detailsCondition"
    | "detailsDesigner"
    | "detailsFabric"
    | "detailsLength"
    | "detailsWidth"
    | "name"
    | "slug";

  const setValue = (key: DetailsTextFieldKey, value: string) => {
    logEvent(`details change: ${key}`, value);
    form.setFieldValue(key, value);
  };

  const handleBlur = (key: keyof ProductStepperValues) => {
    const { instance } = form.getFieldInfo(key);
    (instance as { handleBlur?: () => void } | null)?.handleBlur?.();
  };

  const selectedCollectionValue = formValues.collectionId || noCollectionValue;
  const selectedFabricValue = formValues.detailsFabric || noFabricValue;
  const selectedConditionValue =
    formValues.detailsCondition || noConditionValue;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="product-internal-name">Internal Name</Label>
          <Input
            id="product-internal-name"
            value={formValues.name}
            placeholder="Red Kanjeevaram Saree"
            onBlur={() => handleBlur("name")}
            onChange={(event) => {
              const name = event.target.value;
              setValue("name", name);
              setValue("slug", slugify(name));
            }}
          />
          <p className="text-xs text-muted-foreground">
            This is the internal product name. The public slug is generated from
            this name.
          </p>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="product-generated-slug">Generated Slug</Label>
          <Input
            id="product-generated-slug"
            value={formValues.slug}
            placeholder="red-kanjeevaram-saree"
            readOnly
            className="bg-muted/40 text-muted-foreground"
          />
          <p className="text-xs text-muted-foreground">
            Slugs are generated automatically from the internal name.
          </p>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label>Collection</Label>
          <Select
            value={selectedCollectionValue}
            disabled={collectionsQuery.isLoading}
            onValueChange={(value) => {
              setValue(
                "collectionId",
                value === noCollectionValue ? "" : value,
              );
              handleBlur("collectionId");
            }}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  collectionsQuery.isLoading
                    ? "Loading collections..."
                    : "Select collection"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={noCollectionValue}>No collection</SelectItem>

              {collections.map((collection) => (
                <SelectItem key={collection.id} value={collection.id}>
                  {getCollectionLabel(collection)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            The saved value is the collection ID, but you select it by name
            here.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Fabric</Label>
          <Select
            value={selectedFabricValue}
            onValueChange={(value) => {
              setValue("detailsFabric", value === noFabricValue ? "" : value);
              handleBlur("detailsFabric");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select fabric" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={noFabricValue}>Select fabric</SelectItem>

              {fabricOptions.map((fabric) => (
                <SelectItem key={fabric} value={fabric}>
                  {fabric}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Condition</Label>
          <Select
            value={selectedConditionValue}
            onValueChange={(value) => {
              setValue(
                "detailsCondition",
                value === noConditionValue ? "" : value,
              );
              handleBlur("detailsCondition");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select condition" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={noConditionValue}>Select condition</SelectItem>

              {conditionOptions.map((condition) => (
                <SelectItem key={condition} value={condition}>
                  {condition}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <details className="rounded-lg border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
          Additional measurements and attribution
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </summary>

        <div className="grid gap-4 border-t px-4 py-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="product-designer">Designer</Label>
            <Input
              id="product-designer"
              value={formValues.detailsDesigner}
              placeholder="Designer / maker / source"
              onBlur={() => handleBlur("detailsDesigner")}
              onChange={(event) =>
                setValue("detailsDesigner", event.target.value)
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-length">Length</Label>
            <Input
              id="product-length"
              value={formValues.detailsLength}
              placeholder="e.g. 6.2 m"
              onBlur={() => handleBlur("detailsLength")}
              onChange={(event) =>
                setValue("detailsLength", event.target.value)
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-width">Width</Label>
            <Input
              id="product-width"
              value={formValues.detailsWidth}
              placeholder="e.g. 44 in"
              onBlur={() => handleBlur("detailsWidth")}
              onChange={(event) => setValue("detailsWidth", event.target.value)}
            />
          </div>
        </div>
      </details>

      <form.Field name="tagsCsv">
        {(field) => (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tags</label>
            <TagPicker
              value={parseTagIds(field.state.value)}
              onChange={(ids) => field.handleChange(ids.join(","))}
            />
          </div>
        )}
      </form.Field>
    </div>
  );
}
