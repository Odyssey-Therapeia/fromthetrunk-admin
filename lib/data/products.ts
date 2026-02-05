import { getPayloadClient } from "@/lib/payload";

export const getGlobals = async (slug: string) => {
  const payload = await getPayloadClient();
  return payload.findGlobal({ slug, depth: 2 });
};

export const getProducts = async (limit = 200) => {
  const payload = await getPayloadClient();
  return payload.find({
    collection: "products",
    depth: 2,
    limit,
    where: { status: { equals: "published" } },
    sort: "-createdAt",
  });
};

export const getFeaturedProducts = async (limit = 4) => {
  const payload = await getPayloadClient();
  return payload.find({
    collection: "products",
    depth: 2,
    limit,
    where: {
      and: [
        { status: { equals: "published" } },
        { featured: { equals: true } },
      ],
    },
    sort: "-createdAt",
  });
};

export const getProductBySlug = async (slug: string) => {
  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "products",
    depth: 2,
    limit: 1,
    where: { slug: { equals: slug } },
  });
  return result.docs[0] ?? null;
};
