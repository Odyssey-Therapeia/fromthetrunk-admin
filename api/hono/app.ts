import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";

import { authMiddleware } from "@/api/hono/middleware/auth";
import { registerAddressRoutes } from "@/api/hono/routes/addresses";
import { registerAdminDashboardRoutes } from "@/api/hono/routes/admin-dashboard";
import { registerAdminImportRoutes } from "@/api/hono/routes/admin-import";
import { registerAdminOrderRoutes } from "@/api/hono/routes/admin-orders";
import { registerNavigationRoutes } from "@/api/hono/routes/navigation";
import { registerPagesRoutes } from "@/api/hono/routes/pages";
import { registerRedirectsRoutes } from "@/api/hono/routes/redirects";
import { registerThemeRoutes } from "@/api/hono/routes/theme";
import { registerCartRoutes } from "@/api/hono/routes/cart";
import { registerCollectionRoutes } from "@/api/hono/routes/collections";
import { registerConversationRoutes } from "@/api/hono/routes/conversations";
import { registerCronRoutes } from "@/api/hono/routes/cron";
import { registerGlobalRoutes } from "@/api/hono/routes/globals";
import { registerMediaRoutes } from "@/api/hono/routes/media";
import { registerNewsletterRoutes } from "@/api/hono/routes/newsletter";
import { registerOrderRoutes } from "@/api/hono/routes/orders";
import { registerPaymentRoutes } from "@/api/hono/routes/payments";
import { registerProductRoutes } from "@/api/hono/routes/products";
import { registerSearchRoutes } from "@/api/hono/routes/search";
import { registerUserRoutes } from "@/api/hono/routes/users";
import { registerWishlistRoutes } from "@/api/hono/routes/wishlist";
import { registerWebhookRoutes } from "@/api/hono/routes/webhooks";
import { registerFeedsRoutes } from "@/api/hono/routes/feeds";
import type { HonoBindings } from "@/api/hono/types";
import { onUncaughtError } from "@/lib/http/on-uncaught-error";

const app = new OpenAPIHono<HonoBindings>().basePath("/api/v2");

app.use("*", cors());
app.use("*", authMiddleware);

app.doc("/openapi.json", {
  info: {
    title: "FTT API v2",
    version: "1.0.0",
  },
  openapi: "3.1.0",
});

app.get("/docs", swaggerUI({ url: "/api/v2/openapi.json" }));

const productsApp = new OpenAPIHono<HonoBindings>();
registerProductRoutes(productsApp);
app.route("/products", productsApp);

const collectionsApp = new OpenAPIHono<HonoBindings>();
registerCollectionRoutes(collectionsApp);
app.route("/collections", collectionsApp);

const ordersApp = new OpenAPIHono<HonoBindings>();
registerOrderRoutes(ordersApp);
app.route("/orders", ordersApp);

const usersApp = new OpenAPIHono<HonoBindings>();
registerUserRoutes(usersApp);
app.route("/users", usersApp);

const addressesApp = new OpenAPIHono<HonoBindings>();
registerAddressRoutes(addressesApp);
app.route("/addresses", addressesApp);

const wishlistApp = new OpenAPIHono<HonoBindings>();
registerWishlistRoutes(wishlistApp);
app.route("/wishlist", wishlistApp);

const mediaApp = new OpenAPIHono<HonoBindings>();
registerMediaRoutes(mediaApp);
app.route("/media", mediaApp);

const newsletterApp = new OpenAPIHono<HonoBindings>();
registerNewsletterRoutes(newsletterApp);
app.route("/newsletter", newsletterApp);

const searchApp = new OpenAPIHono<HonoBindings>();
registerSearchRoutes(searchApp);
app.route("/search", searchApp);

const globalsApp = new OpenAPIHono<HonoBindings>();
registerGlobalRoutes(globalsApp);
app.route("/globals", globalsApp);

const cartApp = new OpenAPIHono<HonoBindings>();
registerCartRoutes(cartApp);
app.route("/cart", cartApp);

const paymentsApp = new OpenAPIHono<HonoBindings>();
registerPaymentRoutes(paymentsApp);
app.route("/payments", paymentsApp);

const webhooksApp = new OpenAPIHono<HonoBindings>();
registerWebhookRoutes(webhooksApp);
app.route("/webhooks", webhooksApp);

const cronApp = new OpenAPIHono<HonoBindings>();
registerCronRoutes(cronApp);
app.route("/cron", cronApp);

const adminDashboardApp = new OpenAPIHono<HonoBindings>();
registerAdminDashboardRoutes(adminDashboardApp);
app.route("/admin/dashboard", adminDashboardApp);

const adminImportApp = new OpenAPIHono<HonoBindings>();
registerAdminImportRoutes(adminImportApp);
app.route("/admin/import", adminImportApp);

const adminOrdersApp = new OpenAPIHono<HonoBindings>();
registerAdminOrderRoutes(adminOrdersApp);
app.route("/admin/orders", adminOrdersApp);

const adminPagesApp = new OpenAPIHono<HonoBindings>();
registerPagesRoutes(adminPagesApp);
app.route("/admin/pages", adminPagesApp);

const adminThemeApp = new OpenAPIHono<HonoBindings>();
registerThemeRoutes(adminThemeApp);
app.route("/admin/theme", adminThemeApp);

const adminNavigationApp = new OpenAPIHono<HonoBindings>();
registerNavigationRoutes(adminNavigationApp);
app.route("/admin/navigation", adminNavigationApp);

const adminRedirectsApp = new OpenAPIHono<HonoBindings>();
registerRedirectsRoutes(adminRedirectsApp);
app.route("/admin/redirects", adminRedirectsApp);

const conversationsApp = new OpenAPIHono<HonoBindings>();
registerConversationRoutes(conversationsApp);
app.route("/conversations", conversationsApp);

const feedsApp = new OpenAPIHono<HonoBindings>();
registerFeedsRoutes(feedsApp);
app.route("/feeds", feedsApp);

app.onError(onUncaughtError);

export default app;
