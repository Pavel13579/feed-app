import { dbProductToNormalized } from "./normalizer.server";
import db from "../db.server";
import { getAdapter } from "app/services/feeds/registry";
import { getFeedSettings } from "app/services/feeds/settings";
import { getCurrencyExponent } from "app/utils/money";
import { checkProducts } from "app/services/feeds/health";

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
          errorCount: 0,
          warningCount: 0,
          healthScore: 100,
          lastGeneratedAt: new Date(),
        },
      });

      return {
        ...updatedFeed,
        skippedItems: 0,
        errorCount: 0,
        warningCount: 0,
        healthScore: 100,
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

    const rawIssues = checkProducts(normalizedProducts, adapter.rules);

    const errorCount = rawIssues.filter(i => i.severity === "error").length;
    const warningCount = rawIssues.filter(i => i.severity === "warning").length;

    const totalVariants = normalizedProducts.reduce((acc, p) => acc + p.variants.length, 0);
    const healthScore = totalVariants > 0
      ? Math.max(0, Math.round(((totalVariants - errorCount) / totalVariants) * 100))
      : 100;

    const { xml, itemCount, skippedCount } = adapter.render(normalizedProducts, shopDomain, currencyCode);

    if (itemCount === 0 && skippedCount > 0) {
      console.warn(`Feed ${feedId}: 0 items, ${skippedCount} skipped — saving empty feed.`);
    }

    const updatedFeed = await db.$transaction(async (tx) => {
      await tx.feedIssue.deleteMany({ where: { feedId } });

      if (rawIssues.length > 0) {
        await tx.feedIssue.createMany({
          data: rawIssues.map((issue) => ({
            feedId,
            productId: issue.productId,
            variantId: issue.variantId,
            code: issue.code,
            severity: issue.severity,
            message: issue.message,
          })),
        });
      }

    
      return tx.feed.update({
        where: { id: feedId },
        data: {
          content: xml,
          itemCount: itemCount, 
          errorCount,
          warningCount,
          healthScore,
          lastGeneratedAt: new Date(),
        },
      });
    });

    return {
      ...updatedFeed,
      skippedItems: skippedCount,
      errorCount,
      warningCount,
      healthScore,
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