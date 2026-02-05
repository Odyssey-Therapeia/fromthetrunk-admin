import { getPayload } from "payload";

import config from "../payload.config";
import { sarees } from "../lib/data/sarees";

const fetchImage = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return { buffer, contentType };
};

const ensureCollection = async (payload: any) => {
  const existing = await payload.find({
    collection: "collections",
    where: { slug: { equals: "archive" } },
    limit: 1,
    overrideAccess: true,
  });

  if (existing.docs[0]) {
    return existing.docs[0];
  }

  return payload.create({
    collection: "collections",
    data: {
      name: "Archive",
      slug: "archive",
      description: "Curated archive of heirloom sarees.",
      featured: true,
    },
    overrideAccess: true,
  });
};

const run = async () => {
  const payload = await getPayload({ config });
  const archiveCollection = await ensureCollection(payload);

  for (const saree of sarees) {
    const existing = await payload.find({
      collection: "products",
      where: { slug: { equals: saree.slug } },
      limit: 1,
      overrideAccess: true,
    });

    if (existing.docs[0]) {
      continue;
    }

    const mediaIds: string[] = [];

    for (let index = 0; index < saree.images.length; index += 1) {
      const url = saree.images[index];
      try {
        const { buffer, contentType } = await fetchImage(url);
        const extension = contentType.includes("png") ? "png" : "jpg";
        const media = await payload.create({
          collection: "media",
          data: {
            alt: `${saree.name} image ${index + 1}`,
          },
          file: {
            data: buffer,
            mimetype: contentType,
            name: `${saree.slug}-${index + 1}.${extension}`,
            size: buffer.length,
          },
          overrideAccess: true,
        });
        mediaIds.push(media.id);
      } catch (error) {
        console.warn(`Skipping image for ${saree.name}:`, error);
      }
    }

    await payload.create({
      collection: "products",
      data: {
        name: saree.name,
        slug: saree.slug,
        price: saree.price,
        originalPrice: saree.originalPrice,
        featured: saree.featured,
        images: mediaIds,
        story: saree.story,
        details: saree.details,
        collection: archiveCollection.id,
        status: "published",
      },
      overrideAccess: true,
    });
  }

  await payload.destroy();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
