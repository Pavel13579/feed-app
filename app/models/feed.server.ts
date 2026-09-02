import { dbProductToNormalized } from "./normalizer.server";
import db from "../db.server";
import { getAdapter } from "app/services/feeds/registry";
import { getFeedSettings } from "app/services/feeds/settings";
import { getCurrencyExponent } from "app/utils/money";

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
  
  const exponent = getCurrencyExponent(currencyCode);

  const adapter = getAdapter(channel);
  
  const feedSettings = getFeedSettings(feed.settings);

  try {
    const dbProducts = await db.product.findMany({
      where: { 
        shopId: shopId,
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
      dbProductToNormalized({
        product,
        shopDomain,
        settings: feedSettings,
        exponent,
      })
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


export async function ensureShopAndFeed(shopDomain: string, channel: string, defaultName: string) {
  let shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) {
    shop = await db.shop.create({ data: { shopDomain } });
  }

  let feed = await db.feed.findFirst({
    where: { shopId: shop.id, channel },
  });

  if (!feed) {
    feed = await db.feed.create({
      data: {
        shopId: shop.id,
        channel,
        name: defaultName,
        token: crypto.randomUUID(),
        content: "",
        itemCount: 0,
      },
    });
  }

  return { shop, feed };
}