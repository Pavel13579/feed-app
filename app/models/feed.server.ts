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
      where: { shopId: shopId,
        status: "ACTIVE",
       },
      include: {
        variants: true,
        images: { orderBy: { position: "asc" } },
      },
    });

    if (dbProducts.length === 0) {
      
      const { xml } = adapter.render([], shopDomain);

      const updatedFeed = await db.feed.update({
        where: { id: feedId },
        data: {
          content: xml, 
          itemCount: 0,
          lastGeneratedAt: new Date(),
        },
      });

      return {
        ...updatedFeed,
        skippedItems: 0,
      };
    }

    const normalizedProducts = dbProducts.map((product) =>
      dbProductToNormalized(product, shopDomain)
    );

    const { xml, itemCount, skippedCount } = adapter.render(normalizedProducts, shopDomain);

    if (dbProducts.length > 0 && itemCount === 0) {
      throw new Error("Total items 0. Failed to generate feed");
    }

    const updatedFeed = await db.feed.update({
      where: { id: feedId },
      data: {
        content: xml,
        itemCount: itemCount, 
        lastGeneratedAt: new Date(),
      },
    });

    return {
      ...updatedFeed,
      skippedItems: skippedCount,
    };

  } catch (error) {
    console.error(`Failed for feed ${feedId}:`, error);
    throw error;
  }
}