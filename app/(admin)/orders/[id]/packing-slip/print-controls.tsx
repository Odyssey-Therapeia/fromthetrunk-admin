"use client";

type PrintControlsProps = {
  orderId: string;
  orderNumber: string;
};

export function PrintControls({ orderId, orderNumber }: PrintControlsProps) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Purchase slip
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Default PDF name: Purchase Slip {orderNumber} - From The Trunk
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            For a clean PDF in Chrome, turn off “Headers and footers” in the
            print dialog.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-full bg-foreground px-6 py-2 text-sm font-medium text-background transition hover:opacity-90"
            onClick={() => window.print()}
            type="button"
          >
            Print / Save PDF
          </button>

          <a
            className="rounded-full border border-border bg-card px-6 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
            href={`/orders/${orderId}`}
          >
            Back to order
          </a>
        </div>
      </div>
    </div>
  );
}
