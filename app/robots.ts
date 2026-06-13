import type { MetadataRoute } from "next";

import { getSiteOrigin } from "@/lib/config/site";

const baseUrl = getSiteOrigin();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/account", "/checkout", "/api"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
