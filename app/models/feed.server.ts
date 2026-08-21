import { dbProductToNormalized } from "./normalizer.server";
import db from "../db.server";
import { getAdapter } from "app/services/feeds/registry";
import { getFeedSettings } from "app/services/feeds/settings";

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

  if (!shop.currencyCode) {
    throw new Error(
      `Shop ${shopDomain} has no currencyCode yet — run a product sync first (it fetches shop { currencyCode }).`
    );
  }
  const currencyCode = shop.currencyCode;

  const adapter = getAdapter(channel);
  
  const { categoryMapping } = getFeedSettings(feed.settings);

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
      
      const { xml } = adapter.render([], shopDomain, currencyCode);

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
      dbProductToNormalized(product, shopDomain, categoryMapping)
    );

    const { xml, itemCount, skippedCount } = adapter.render(normalizedProducts, shopDomain, currencyCode);

    if (itemCount === 0 && skippedCount > 0) {
      console.warn(`Feed ${feedId}: 0 items, ${skippedCount} skipped — saving empty feed.`);
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