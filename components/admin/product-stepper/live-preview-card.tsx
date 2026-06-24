import { memo, type ReactElement, useMemo, useState } from "react";

import Image from "next/image";
import {
  ArrowUpRight,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Gem,
  Maximize2,
  PackageCheck,
  Ruler,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatINR, toPaise } from "@/db/money";
import { cn } from "@/lib/utils";

import { productStockStatusLabels } from "./availability";
import type { ProductStepperValues } from "./types";

import { useRenderLog } from "./_render-log";

type LivePreviewCardProps = {
  imageUrls?: Array<{
    id: string;
    url: string;
  }>;
  values: ProductStepperValues;
};

type EffectiveStockStatus = "available" | "reserved" | "sold";

const shouldBypassNextImageOptimization = (url: string) =>
  url.startsWith("/dev-uploads/") ||
  url.includes(".public.blob.vercel-storage.com");

const getDisplayTitle = (values: ProductStepperValues) =>
  values.name || values.storyTitle || "Untitled Product";

const getStoryTitle = (values: ProductStepperValues) =>
  values.storyTitle || values.name || "A restored heirloom from the trunk.";

const getDisplayText = (value: string, fallback = "Not set") =>
  value.trim().length > 0 ? value : fallback;

function LivePreviewCardImpl({ imageUrls = [], values }: LivePreviewCardProps) {
  useRenderLog("LivePreviewCard");

  const [isExpanded, setIsExpanded] = useState(false);
  const [isProductPreviewOpen, setIsProductPreviewOpen] = useState(false);

  const displayImages = useMemo(
    () => imageUrls.filter((image) => image.url),
    [imageUrls],
  );

  const coverImage = displayImages[0] ?? null;
  const previewTitle = getDisplayTitle(values);
  const storyTitle = getStoryTitle(values);
  const priceLabel = formatINR(toPaise(values.priceRupees || 0));
  const originalPriceLabel =
    values.originalPriceRupees > 0
      ? formatINR(toPaise(values.originalPriceRupees))
      : null;
  const statusLabel = values.status === "published" ? "Published" : "Draft";
  const stockStatusLabel = productStockStatusLabels[values.stockStatus];
  const isSold = values.stockStatus === "sold";
  const isReserved = values.stockStatus === "reserved";

  return (
    <>
      <Card className="sticky top-24">
        <CardHeader className="space-y-3">
          <button
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setIsExpanded((value) => !value)}
            type="button"
          >
            <div>
              <CardTitle className="text-lg">Live Preview</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Website card and product-page mirror.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant={
                  values.status === "published" ? "default" : "secondary"
                }
              >
                {statusLabel}
              </Badge>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </button>

          {!isExpanded ? (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{previewTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {displayImages.length} image
                  {displayImages.length === 1 ? "" : "s"} attached
                </p>
              </div>
              <Button
                onClick={() => setIsExpanded(true)}
                size="sm"
                type="button"
                variant="outline"
              >
                Open
              </Button>
            </div>
          ) : null}
        </CardHeader>

        {isExpanded ? (
          <CardContent className="space-y-4">
            <button
              className="@container block w-full text-left"
              onClick={() => setIsProductPreviewOpen(true)}
              type="button"
            >
              <article
                data-ftt-product-card
                className={cn(
                  "ftt-product-card group relative isolate mx-auto flex h-full max-w-[18rem] transform-gpu flex-col overflow-hidden rounded-[1.35rem] border border-[#E7DDD4]/80 bg-card/80 text-card-foreground shadow-soft transition duration-300 hover:-translate-y-1 hover:border-trunk-gold/40 hover:shadow-lift",
                  isSold && "opacity-75",
                )}
              >
                <div className="relative">
                  <div className="relative aspect-3/4 overflow-hidden @sm:aspect-4/5">
                    {coverImage ? (
                      <Image
                        src={coverImage.url}
                        alt={previewTitle}
                        fill
                        sizes="288px"
                        quality={90}
                        unoptimized={shouldBypassNextImageOptimization(
                          coverImage.url,
                        )}
                        className={cn(
                          "object-cover transition duration-700 group-hover:scale-105",
                          isSold && "grayscale",
                        )}
                        priority
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        No image
                      </div>
                    )}

                    <div className="absolute inset-0 bg-linear-to-t from-black/25 via-black/0 to-transparent opacity-0 transition duration-500 group-hover:opacity-100" />

                    {isSold ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Badge className="bg-foreground/90 text-background shadow-soft">
                          Sold
                        </Badge>
                      </div>
                    ) : null}

                    {isReserved ? (
                      <Badge className="absolute left-2 top-2 bg-amber-100/90 text-[10px] text-trunk-brown shadow-soft @sm:left-4 @sm:top-4 @sm:text-xs">
                        Reserved
                      </Badge>
                    ) : null}

                    {!isSold && !isReserved && originalPriceLabel ? (
                      <Badge className="absolute left-2 top-2 bg-white/85 text-[10px] text-trunk-brown shadow-soft @sm:left-4 @sm:top-4 @sm:text-xs">
                        Pre-loved
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <div className="flex min-w-0 flex-1 flex-col p-2 @sm:p-4">
                  <div className="block min-w-0 flex-1 space-y-1 @sm:space-y-1.5">
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 font-serif text-[13px] leading-tight text-foreground @sm:text-base @md:text-lg">
                          {previewTitle}
                        </h3>
                        <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground @sm:text-xs @sm:tracking-[0.2em]">
                          <span>{values.detailsFabric || "Heirloom"}</span>
                          <span className="hidden @sm:inline">
                            , one of a kind
                          </span>
                        </p>
                      </div>
                      <ArrowUpRight className="mt-0.5 hidden h-5 w-5 shrink-0 text-muted-foreground transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground @sm:block" />
                    </div>

                    <div className="flex items-center gap-1 @sm:gap-2">
                      <span
                        className={cn(
                          "text-xs font-semibold @sm:text-sm",
                          isSold
                            ? "text-muted-foreground line-through"
                            : "text-foreground",
                        )}
                      >
                        {priceLabel}
                      </span>
                      {originalPriceLabel && !isSold ? (
                        <span className="text-[10px] text-muted-foreground line-through @sm:text-xs">
                          {originalPriceLabel}
                        </span>
                      ) : null}
                    </div>

                    <p className="hidden text-sm text-muted-foreground @sm:block">
                      {values.storyTitle || "A story from the trunk"}
                    </p>
                  </div>

                  <div className="mt-3 rounded-full border border-[#E7DDD4] bg-[#FDF7F1]/80 px-3 py-2 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-[#601D1C]/70">
                    Preview product page
                  </div>
                </div>
              </article>
            </button>

            <Button
              className="w-full gap-1.5"
              onClick={() => setIsProductPreviewOpen(true)}
              type="button"
              variant="outline"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              View product page preview
            </Button>

            <div className="flex flex-wrap gap-1.5">
              <Badge
                variant={
                  values.status === "published" ? "default" : "secondary"
                }
              >
                {statusLabel}
              </Badge>
              {values.stockStatus !== "available" ? (
                <Badge
                  variant={
                    values.stockStatus === "sold" ? "destructive" : "outline"
                  }
                >
                  {stockStatusLabel}
                </Badge>
              ) : null}
              {values.featured ? <Badge>Featured</Badge> : null}
            </div>
          </CardContent>
        ) : null}
      </Card>

      <Dialog
        open={isProductPreviewOpen}
        onOpenChange={setIsProductPreviewOpen}
      >
        <DialogContent className="max-h-[92vh] max-w-7xl overflow-y-auto bg-[#FDF7F1] p-0 text-[#0E0D0E]">
          <DialogHeader className="border-b border-[#E7DDD4] bg-[#FFFCF8]/88 px-6 py-4">
            <DialogTitle>Product page preview</DialogTitle>
            <DialogDescription>
              Admin-only mirror of the website PDP. This does not require the
              product to be published.
            </DialogDescription>
          </DialogHeader>

          <div className="mx-auto w-full max-w-360 space-y-7 px-4 py-4 sm:px-6 sm:py-6 lg:space-y-9 lg:px-8 lg:py-7">
            <nav
              aria-label="Breadcrumb"
              className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-[#601D1C]/55"
            >
              <span>Home</span>
              <span>/</span>
              <span>Collection</span>
              <span>/</span>
              <span className="max-w-[18rem] truncate text-[#141D46]">
                Product dossier
              </span>
            </nav>

            <section className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(300px,0.58fr)] md:items-stretch md:[--pdp-panel-height:min(72vh,760px)] lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.58fr)] lg:gap-7 lg:[--pdp-panel-height:min(74vh,800px)]">
              <div className="space-y-3">
                {coverImage ? (
                  <div className="relative aspect-4/5 overflow-hidden rounded-[1.15rem] border border-[#E7DDD4] bg-muted md:min-h-(--pdp-panel-height)">
                    <Image
                      alt={previewTitle}
                      src={coverImage.url}
                      fill
                      sizes="(max-width: 1024px) 100vw, 760px"
                      quality={90}
                      unoptimized={shouldBypassNextImageOptimization(
                        coverImage.url,
                      )}
                      className="object-cover"
                      priority
                    />
                  </div>
                ) : (
                  <div className="flex aspect-4/5 items-center justify-center rounded-[1.15rem] border border-dashed border-muted-foreground/30 bg-muted/30 px-6 text-center text-sm text-muted-foreground md:min-h-(--pdp-panel-height)">
                    Upload product photos to preview the product page gallery.
                  </div>
                )}

                {displayImages.length > 1 ? (
                  <div className="grid grid-cols-4 gap-2">
                    {displayImages.slice(0, 8).map((image, index) => (
                      <div
                        className="relative aspect-4/5 overflow-hidden rounded-lg border border-[#E7DDD4] bg-muted"
                        key={image.id}
                      >
                        <Image
                          alt={`${previewTitle} thumbnail ${index + 1}`}
                          src={image.url}
                          fill
                          sizes="120px"
                          quality={90}
                          unoptimized={shouldBypassNextImageOptimization(
                            image.url,
                          )}
                          className="object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <aside className="h-full rounded-[1.15rem] border border-[#E7DDD4] bg-[#FFFCF8]/88 p-4 shadow-[0_14px_38px_rgba(20,29,70,0.06)] backdrop-blur md:min-h-(--pdp-panel-height) lg:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#B39152]">
                      Product Dossier
                    </p>
                    <p className="mt-1 text-xs text-[#141D46]/52">
                      One-of-one circular saree
                    </p>
                  </div>
                  <StockBadge stockStatus={values.stockStatus} />
                </div>

                <h1 className="mt-4 font-serif text-[clamp(2rem,3.2vw,3.35rem)] leading-[0.93] text-[#601D1C]">
                  {previewTitle}
                </h1>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#141D46]/68">
                  {storyTitle}
                </p>

                <div className="mt-4 grid gap-2 min-[420px]:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
                  <TrustSignal
                    icon={<BadgeCheck />}
                    label="Verified"
                    value="By FTT"
                  />
                  <TrustSignal
                    icon={<ShieldCheck />}
                    label="Condition"
                    value="Graded"
                  />
                  <TrustSignal icon={<Gem />} label="Edition" value="1 of 1" />
                  <TrustSignal
                    icon={<Sparkles />}
                    label="Origin"
                    value={values.storyProvenance || "Private trunk"}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-3 border-y border-[#E7DDD4] py-3">
                  <span className="text-2xl font-semibold text-[#141D46]">
                    {priceLabel}
                  </span>
                  {originalPriceLabel ? (
                    <span className="pb-0.5 text-sm text-[#601D1C]/45 line-through">
                      {originalPriceLabel}
                    </span>
                  ) : null}
                  {values.storyEra ? (
                    <span className="ml-auto rounded-full border border-[#E7DDD4] bg-[#FDF7F1] px-3 py-1 text-xs text-[#601D1C]/70">
                      {values.storyEra}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <DossierFact
                    label="Fabric"
                    value={getDisplayText(values.detailsFabric, "Pending")}
                  />
                  <DossierFact
                    label="Grade"
                    value={getDisplayText(values.detailsCondition, "Pending")}
                  />
                  <DossierFact
                    label="Length"
                    value={getDisplayText(values.detailsLength, "Pending")}
                  />
                  <DossierFact
                    label="Width"
                    value={getDisplayText(values.detailsWidth, "Pending")}
                  />
                </div>

                <div className="mt-4 space-y-2.5">
                  <div className="rounded-full bg-[#141D46] px-5 py-3 text-center text-sm font-semibold text-[#FDF7F1] shadow-[0_14px_34px_rgba(20,29,70,0.18)]">
                    Add to Bag
                  </div>

                  <p className="text-xs leading-5 text-[#141D46]/58">
                    Adding this piece reserves the one-of-one saree in your bag.
                    Final ownership is confirmed at checkout.
                  </p>
                </div>

                <div className="mt-4 grid gap-2 rounded-3xl border border-[#141D46]/10 bg-[#141D46] p-3 text-[#FDF7F1]">
                  <TrustLine
                    icon={<ShieldCheck />}
                    text="Authenticated by hand"
                  />
                  <TrustLine
                    icon={<PackageCheck />}
                    text="Packed with muslin care"
                  />
                  <TrustLine icon={<Truck />} text="Shipping at checkout" />
                </div>

                <Accordion
                  type="single"
                  collapsible
                  className="mt-3 border-t border-[#E7DDD4]"
                >
                  <AccordionItem value="story" className="border-[#E7DDD4]">
                    <AccordionTrigger className="text-sm text-[#141D46]">
                      Story and provenance
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 text-sm leading-6 text-[#141D46]/65">
                      <p>
                        {values.storyNarrative ||
                          "This saree has been reviewed, restored, and prepared for its next chapter."}
                      </p>
                      {values.storyProvenance ? (
                        <p>
                          <span className="font-semibold text-[#141D46]">
                            Provenance:
                          </span>{" "}
                          {values.storyProvenance}
                        </p>
                      ) : null}
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="care" className="border-[#E7DDD4]">
                    <AccordionTrigger className="text-sm text-[#141D46]">
                      Care and ownership
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-6 text-[#141D46]/65">
                      Dry clean only. Store folded in muslin, away from direct
                      sunlight and humidity. Shipping and taxes are calculated
                      at checkout.
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem
                    value="measurements"
                    className="border-[#E7DDD4]"
                  >
                    <AccordionTrigger className="text-sm text-[#141D46]">
                      Measurements
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-6 text-[#141D46]/65">
                      Length: {getDisplayText(values.detailsLength)}. Width:{" "}
                      {getDisplayText(values.detailsWidth)}. Condition:{" "}
                      {getDisplayText(values.detailsCondition)}.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </aside>
            </section>

            <section className="overflow-hidden rounded-4xl border border-[#141D46]/10 bg-[#141D46] p-4 text-[#FDF7F1] shadow-[0_16px_42px_rgba(20,29,70,0.13)] sm:p-5 lg:grid lg:grid-cols-[0.9fr_1.4fr] lg:items-center lg:gap-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#B39152]">
                  Provenance Promise
                </p>
                <h2 className="mt-2 max-w-xl font-serif text-[clamp(1.7rem,2.6vw,2.7rem)] leading-[0.98]">
                  Not just pre-loved. Carefully re-storied.
                </h2>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:mt-0">
                <PromiseStat label="Authenticated" value="By hand" />
                <PromiseStat
                  label="Condition"
                  value={getDisplayText(values.detailsCondition, "Pending")}
                />
                <PromiseStat label="Ownership" value="One of one" />
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <InfoCard
                icon={<Gem />}
                title="Provenance"
                body={
                  values.storyProvenance ||
                  "Sourced from a private trunk and reviewed before listing."
                }
              />
              <InfoCard
                icon={<ShieldCheck />}
                title="Condition"
                body={getDisplayText(values.detailsCondition, "Pending")}
              />
              <InfoCard
                icon={<Sparkles />}
                title="Textile"
                body={
                  values.detailsDesigner
                    ? `${getDisplayText(
                        values.detailsFabric,
                        "Fabric pending",
                      )} by ${values.detailsDesigner}`
                    : getDisplayText(values.detailsFabric, "Fabric pending")
                }
              />
              <InfoCard
                icon={<Ruler />}
                title="Measurements"
                body={`${getDisplayText(values.detailsLength)}. ${getDisplayText(
                  values.detailsWidth,
                )}.`}
              />
              <InfoCard
                icon={<PackageCheck />}
                title="Care"
                body="Dry clean only. Store in muslin and keep away from direct sunlight."
              />
              <InfoCard
                icon={<Truck />}
                title="Shipping and ownership"
                body="Secure packing. Shipping and taxes are calculated at checkout."
              />
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StockBadge({ stockStatus }: { stockStatus: EffectiveStockStatus }) {
  const label = productStockStatusLabels[stockStatus];

  return (
    <Badge
      className={
        stockStatus === "available"
          ? "rounded-full border border-[#141D46]/15 bg-[#141D46]/8 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#141D46] shadow-none"
          : "rounded-full border border-[#601D1C]/20 bg-[#601D1C]/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#601D1C] shadow-none"
      }
    >
      {label}
    </Badge>
  );
}

function DossierFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E7DDD4] bg-[#FDF7F1]/80 p-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#B39152]">
        {label}
      </p>
      <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[#141D46] sm:text-sm">
        {value}
      </p>
    </div>
  );
}

function TrustSignal({
  icon,
  label,
  value,
}: {
  icon: ReactElement;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[#E7DDD4] bg-[#FDF7F1]/72 p-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#B39152]/12 text-[#B39152] [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#601D1C]/52">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-xs font-medium text-[#141D46]">
          {value}
        </span>
      </span>
    </div>
  );
}

function TrustLine({ icon, text }: { icon: ReactElement; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-xs text-[#FDF7F1]/78">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#B39152]/14 text-[#B39152] [&_svg]:h-3.5 [&_svg]:w-3.5">
        {icon}
      </span>
      <span>{text}</span>
    </div>
  );
}

function PromiseStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/8 p-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#B39152]">
        {label}
      </p>
      <p className="mt-1.5 line-clamp-2 font-serif text-xl leading-none text-[#FDF7F1]">
        {value}
      </p>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  body,
}: {
  icon: ReactElement;
  title: string;
  body: string;
}) {
  return (
    <article className="h-full rounded-4xl border border-[#E7DDD4] bg-[#FFFCF8]/82 p-4 shadow-[0_14px_34px_rgba(20,29,70,0.05)]">
      <div className="mb-4 grid h-9 w-9 place-items-center rounded-full bg-[#141D46] text-[#B39152] [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </div>
      <h3 className="font-serif text-[1.45rem] leading-none text-[#601D1C]">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-[#141D46]/62">{body}</p>
    </article>
  );
}

export const LivePreviewCard = memo(LivePreviewCardImpl);
LivePreviewCard.displayName = "LivePreviewCard";
