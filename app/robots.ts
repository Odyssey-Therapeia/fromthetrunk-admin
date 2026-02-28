import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || "https://fromthetrunk.com";

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
