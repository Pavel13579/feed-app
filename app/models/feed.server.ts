import { dbProductToNormalized } from "./normalizer.server";
import db from "../db.server";
import { findAdapter, getAdapter } from "app/services/feeds/registry";
import { getFeedSettings } from "app/services/feeds/settings";
import { getCurrencyExponent } from "app/utils/money";
import { checkProducts } from "app/services/feeds/health";
import { FEED_NAME_MAX_LENGTH } from "app/services/feeds/constants";

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

  const renderContext = { shopDomain, currencyCode, exponent, settings: feedSettings };

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
      const { xml } = adapter.render([], renderContext);

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

    const errorCount = rawIssues.filter((i) => i.severity === "error").length;
    const warningCount = rawIssues.filter((i) => i.severity === "warning").length;

    const totalVariants = normalizedProducts.reduce((acc, p) => acc + p.variants.length, 0);
    const healthScore =
      totalVariants > 0
        ? Math.max(0, Math.round(((totalVariants - errorCount) / totalVariants) * 100))
        : 100;

    const { xml, itemCount } = adapter.render(normalizedProducts, renderContext);

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
            message: issue.message ?? null,
          })),
        });
      }

      return tx.feed.update({
        where: { id: feedId },
        data: {
          content: xml,
          itemCount,
          errorCount,
          warningCount,
          healthScore,
          lastGeneratedAt: new Date(),
        },
      });
    });

    return updatedFeed;
  } catch (error) {
    throw error;
  }
}


export async function createFeed(params: { shopDomain: string; channel: string; name?: string | null }) {
  const adapter = findAdapter(params.channel);
  if (!adapter) {
    throw new Error(`Unsupported feed channel: "${params.channel}"`);
  }

  const name = params.name?.trim() || adapter.descriptor.defaultFeedName;

  const shop = await db.shop.upsert({
    where: { shopDomain: params.shopDomain },
    update: {},
    create: { shopDomain: params.shopDomain },
  });

  return db.feed.create({
    data: {
      shopId: shop.id,
      channel: adapter.channel,
      name: name.slice(0, FEED_NAME_MAX_LENGTH),
      token: crypto.randomUUID(),
      content: "",
      itemCount: 0,
    },
  });
}