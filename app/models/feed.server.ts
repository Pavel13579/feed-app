import { dbProductToNormalized } from "./normalizer.server";
import db from "../db.server";
import { getAdapter } from "app/services/feeds/registry";

export async function generateFeed(feedId: string) {
  const feed = await db.feed.findUnique({
    where: { id: feedId },
    include: { shop: true },
  });

  if (!feed) {
    throw new Error(`Feed with ID ${feedId} not found`);
  }

  const { channel, shopId, shop } = feed;
  const shopDomain = shop.shopDomain;

  const adapter = getAdapter(channel);

  try {
    const dbProducts = await db.product.findMany({
      where: { shopId: shopId },
      include: {
        variants: true,
        images: { orderBy: { position: "asc" } },
      },
    });

    if (dbProducts.length === 0) {
      const emptyXml = adapter.render([], shopDomain);
      return await db.feed.update({
        where: { id: feedId },
        data: { content: emptyXml, itemCount: 0, lastGeneratedAt: new Date() },
      });
    }

    const normalizedProducts = dbProducts.map((product) =>
      dbProductToNormalized(product, shopDomain)
    );

    const xmlContent = adapter.render(normalizedProducts, shopDomain);
    const totalItems = normalizedProducts.reduce((acc, p) => acc + p.variants.length, 0);

    if (dbProducts.length > 0 && totalItems === 0) {
        throw new Error(
        "Total itmes 0. Failed to generate feed");
    }

    return await db.feed.update({
      where: { id: feedId },
      data: {
        content: xmlContent,
        itemCount: totalItems,
        lastGeneratedAt: new Date(),
      },
    });

  } catch (error) {
    console.error(`Failed for feed ${feedId}:`, error);
    throw error;
  }
}