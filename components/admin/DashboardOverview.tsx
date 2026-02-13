import React from "react";
import { getPayload } from "payload";
import config from "@/payload.config";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const currency = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

const shortDate = (d: string | Date | undefined) => {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(d));
};

const statusColor: Record<string, { bg: string; text: string }> = {
  pending: { bg: "#fef3e0", text: "#b8860b" },
  confirmed: { bg: "#e0f0e8", text: "#2d8a5e" },
  shipped: { bg: "#eae0f5", text: "#6b3fa0" },
  delivered: { bg: "#e0f0e8", text: "#1d6b47" },
};

/* ------------------------------------------------------------------ */
/*  Main Component (React Server Component)                           */
/* ------------------------------------------------------------------ */

export const DashboardOverview = async () => {
  const payload = await getPayload({ config });

  /* Fetch everything in parallel */
  const [ordersResult, productsResult, collectionsResult, mediaResult, allProductsForCounts] =
    await Promise.all([
      payload.find({
        collection: "orders",
        limit: 5,
        sort: "-createdAt",
        overrideAccess: true,
      }),
      payload.find({
        collection: "products",
        limit: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: "collections",
        limit: 100,
        overrideAccess: true,
      }),
      payload.find({
        collection: "media",
        limit: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: "products",
        limit: 1000,
        overrideAccess: true,
      }),
    ]);

  // Build a real product-count-per-collection map
  type DocRecord = Record<string, unknown>;
  const productCountByCollection = new Map<string, number>();
  for (const product of allProductsForCounts.docs) {
    const colRef = (product as DocRecord).collection;
    const colId =
      typeof colRef === "object" && colRef !== null
        ? (colRef as DocRecord).id as string
        : (colRef as string);
    if (colId) {
      productCountByCollection.set(colId, (productCountByCollection.get(colId) ?? 0) + 1);
    }
  }

  /* Derive stats */
  const totalOrders = ordersResult.totalDocs;
  const pendingOrders = ordersResult.docs.filter(
    (o) => (o as DocRecord).status === "pending"
  ).length;
  const totalRevenue = ordersResult.docs.reduce(
    (sum: number, o) => sum + (((o as DocRecord).subtotal as number) ?? 0),
    0
  );
  const totalProducts = productsResult.totalDocs;
  const publishedProducts = productsResult.docs.filter(
    (p) => (p as DocRecord).status === "published"
  ).length;
  const totalCollections = collectionsResult.totalDocs;
  const totalMedia = mediaResult.totalDocs;
  const recentOrders = ordersResult.docs;

  /* ---------------------------------------------------------------- */
  /*  Inline Styles                                                   */
  /* ---------------------------------------------------------------- */

  const wrapper: React.CSSProperties = {
    padding: "0 0 2rem 0",
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  };

  const greetingSection: React.CSSProperties = {
    marginBottom: "1.75rem",
  };

  const greetingTitle: React.CSSProperties = {
    fontSize: "1.65rem",
    fontWeight: 700,
    color: "#2e2017",
    margin: 0,
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    letterSpacing: "-0.01em",
  };

  const greetingSubtitle: React.CSSProperties = {
    fontSize: "0.85rem",
    color: "#7b6c58",
    marginTop: "0.3rem",
  };

  const statsGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "16px",
    marginBottom: "2rem",
  };

  const statCard = (accent: string): React.CSSProperties => ({
    background: "#fefcf8",
    border: "1px solid #ede5d8",
    borderRadius: "14px",
    padding: "1.25rem 1.35rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    boxShadow:
      "0 1px 3px rgba(61,43,31,0.04), 0 4px 12px rgba(61,43,31,0.03)",
    transition: "box-shadow 200ms ease, transform 150ms ease",
    position: "relative",
    overflow: "hidden",
    borderTop: `3px solid ${accent}`,
  });

  const statIconCircle = (bg: string): React.CSSProperties => ({
    width: "40px",
    height: "40px",
    borderRadius: "12px",
    background: bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.1rem",
  });

  const statValue: React.CSSProperties = {
    fontSize: "1.75rem",
    fontWeight: 700,
    color: "#2e2017",
    lineHeight: 1.1,
  };

  const statLabel: React.CSSProperties = {
    fontSize: "0.75rem",
    color: "#7b6c58",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontWeight: 600,
  };

  const statSub: React.CSSProperties = {
    fontSize: "0.78rem",
    color: "#a0907a",
    marginTop: "-0.25rem",
  };

  const twoCol: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1.4fr 1fr",
    gap: "20px",
    marginBottom: "1.75rem",
  };

  const sectionCard: React.CSSProperties = {
    background: "#fefcf8",
    border: "1px solid #ede5d8",
    borderRadius: "14px",
    padding: "1.25rem 1.35rem",
    boxShadow:
      "0 1px 3px rgba(61,43,31,0.04), 0 4px 12px rgba(61,43,31,0.03)",
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: "0.92rem",
    fontWeight: 700,
    color: "#2e2017",
    marginBottom: "1rem",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  };

  const orderRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.65rem 0",
    borderBottom: "1px solid #f0e9dd",
  };

  const badge = (status: string): React.CSSProperties => {
    const c = statusColor[status] ?? { bg: "#f5f0e8", text: "#5e4d3f" };
    return {
      display: "inline-block",
      padding: "0.2rem 0.65rem",
      borderRadius: "100px",
      fontSize: "0.7rem",
      fontWeight: 600,
      background: c.bg,
      color: c.text,
      textTransform: "capitalize",
    };
  };

  const collectionRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.6rem 0",
    borderBottom: "1px solid #f0e9dd",
  };

  const progressBar = (pct: number): React.CSSProperties => ({
    width: "60px",
    height: "6px",
    borderRadius: "100px",
    background: "#ede5d8",
    overflow: "hidden",
    position: "relative",
  });

  const progressFill = (pct: number): React.CSSProperties => ({
    width: `${Math.min(pct, 100)}%`,
    height: "100%",
    borderRadius: "100px",
    background: pct > 60 ? "#6b1d1d" : pct > 30 ? "#b8860b" : "#c8b8a2",
    transition: "width 300ms ease",
  });

  const quickActionsBar: React.CSSProperties = {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  };

  const quickActionBtn: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.55rem 1rem",
    borderRadius: "10px",
    border: "1px solid #ede5d8",
    background: "#fefcf8",
    color: "#2e2017",
    fontSize: "0.82rem",
    fontWeight: 500,
    textDecoration: "none",
    cursor: "pointer",
    transition: "all 150ms ease",
    boxShadow: "0 1px 2px rgba(61,43,31,0.04)",
  };

  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div style={wrapper}>
      {/* ---- Greeting ---- */}
      <div style={greetingSection}>
        <h2 style={greetingTitle}>Welcome back</h2>
        <p style={greetingSubtitle}>{today} &mdash; Here&apos;s your store at a glance.</p>
      </div>

      {/* ---- Stats Row ---- */}
      <div style={statsGrid}>
        {/* Revenue */}
        <div style={statCard("#6b1d1d")}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={statIconCircle("rgba(107,29,29,0.1)")}>
              <span role="img" aria-label="revenue">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b1d1d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </span>
            </div>
            <span style={statLabel}>Total Revenue</span>
          </div>
          <div style={statValue}>{currency(totalRevenue)}</div>
          <div style={statSub}>from {totalOrders} order{totalOrders !== 1 ? "s" : ""}</div>
        </div>

        {/* Products */}
        <div style={statCard("#b8860b")}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={statIconCircle("rgba(184,134,11,0.1)")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b8860b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            </div>
            <span style={statLabel}>Products</span>
          </div>
          <div style={statValue}>
            {totalProducts}
          </div>
          <div style={statSub}>
            {publishedProducts} published
          </div>
        </div>

        {/* Orders */}
        <div style={statCard("#2d8a5e")}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={statIconCircle("rgba(45,138,94,0.1)")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2d8a5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            </div>
            <span style={statLabel}>Orders</span>
          </div>
          <div style={statValue}>{totalOrders}</div>
          <div style={statSub}>
            {pendingOrders} pending
          </div>
        </div>

        {/* Media */}
        <div style={statCard("#5e4d3f")}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={statIconCircle("rgba(94,77,63,0.1)")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5e4d3f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </div>
            <span style={statLabel}>Media Files</span>
          </div>
          <div style={statValue}>{totalMedia}</div>
          <div style={statSub}>{totalCollections} collection{totalCollections !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* ---- Two-column: Recent Orders + Collections ---- */}
      <div style={twoCol}>
        {/* Recent Orders */}
        <div style={sectionCard}>
          <div style={sectionTitle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b1d1d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            Recent Orders
          </div>
          {recentOrders.length === 0 ? (
            <p style={{ color: "#a0907a", fontSize: "0.85rem", padding: "1rem 0" }}>
              No orders yet. They&apos;ll appear here once customers start purchasing.
            </p>
          ) : (
            <div>
              {recentOrders.map((order, i: number) => {
                const o = order as DocRecord;
                const shippingAddr = o.shippingAddress as DocRecord | undefined;
                const orderItems = o.items as unknown[] | undefined;
                return (
                <div
                  key={order.id}
                  style={{
                    ...orderRow,
                    borderBottom:
                      i === recentOrders.length - 1
                        ? "none"
                        : orderRow.borderBottom,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        color: "#2e2017",
                      }}
                    >
                      {(shippingAddr?.name as string) ?? "Customer"}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#a0907a",
                        marginTop: "0.15rem",
                      }}
                    >
                      {shortDate((o.placedAt ?? o.createdAt) as string | undefined)} &middot;{" "}
                      {orderItems?.length ?? 0} item
                      {(orderItems?.length ?? 0) !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={badge((o.status as string) ?? "pending")}>
                      {(o.status as string) ?? "pending"}
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        color: "#2e2017",
                        minWidth: "60px",
                        textAlign: "right",
                      }}
                    >
                      {currency((o.subtotal as number) ?? 0)}
                    </span>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Collections Overview */}
        <div style={sectionCard}>
          <div style={sectionTitle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b8860b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Collections
          </div>
          {collectionsResult.docs.length === 0 ? (
            <p style={{ color: "#a0907a", fontSize: "0.85rem", padding: "1rem 0" }}>
              No collections yet. Create your first collection to get started.
            </p>
          ) : (
            <div>
              {collectionsResult.docs.map((col, i: number) => {
                const c = col as DocRecord;
                const productCount = productCountByCollection.get(col.id as string) ?? 0;
                const pct = totalProducts > 0
                  ? Math.min((productCount / totalProducts) * 100, 100)
                  : 0;
                return (
                  <div
                    key={col.id as string}
                    style={{
                      ...collectionRow,
                      borderBottom:
                        i === collectionsResult.docs.length - 1
                          ? "none"
                          : collectionRow.borderBottom,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "0.85rem",
                          color: "#2e2017",
                        }}
                      >
                        {c.name as string}
                      </div>
                      <div
                        style={{
                          fontSize: "0.72rem",
                          color: "#a0907a",
                          marginTop: "0.1rem",
                        }}
                      >
                        {productCount} product{productCount !== 1 ? "s" : ""} · {c.featured ? "Featured" : "Standard"}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div style={progressBar(pct)}>
                        <div style={progressFill(pct)} />
                      </div>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          color: "#7b6c58",
                          minWidth: "28px",
                          textAlign: "right",
                        }}
                      >
                        {productCount}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ---- Quick Actions ---- */}
      <div style={sectionCard}>
        <div style={sectionTitle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5e4d3f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Quick Actions
        </div>
        {/* eslint-disable @next/next/no-html-link-for-pages -- Payload admin links are outside Next.js routing */}
        <div style={quickActionsBar}>
          <a href="/admin/collections/products/create" style={quickActionBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b1d1d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Product
          </a>
          <a href="/admin/collections/orders" style={quickActionBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b8860b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            View Orders
          </a>
          <a href="/admin/collections/media/create" style={quickActionBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2d8a5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload Media
          </a>
          <a href="/admin/collections/collections/create" style={quickActionBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5e4d3f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
            New Collection
          </a>
          <a href="/admin/globals/homePage" style={quickActionBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b1d1d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit Homepage
          </a>
        </div>
      </div>
    </div>
  );
};
