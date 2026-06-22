"use client";

/**
 * P6-05: Packing slip print controls — client component.
 *
 * Extracted from the Server Component packing-slip/page.tsx to hold
 * the window.print() onClick handler. A Server Component cannot own
 * event handlers on host elements (Next 16 RSC flight serializer throws
 * "Event handlers cannot be passed to Client Component props").
 */

type PrintControlsProps = {
  orderId: string;
};

export function PrintControls({ orderId }: PrintControlsProps) {
  return (
    <div className="no-print mt-8 flex justify-center gap-3">
      <button
        className="rounded-full bg-foreground px-6 py-2 text-sm text-background"
        onClick={() => window.print()}
        type="button"
      >
        Print
      </button>
      <a
        className="rounded-full border border-border px-6 py-2 text-sm text-foreground"
        href={`/orders/${orderId}`}
      >
        Back to Order
      </a>
    </div>
  );
}
