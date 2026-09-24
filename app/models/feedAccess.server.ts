import type { Feed, Shop } from "@prisma/client";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getAdapter } from "app/services/feeds/registry";
import type { FeedAdapter } from "app/services/feeds/types";

export async function requireShop(shopDomain: string): Promise<Shop> {
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }
  return shop;
}

export async function requireFeed(feedId: string | undefined, shopId: string): Promise<Feed> {
  if (!feedId) {
    throw new Response("Feed not found", { status: 404 });
  }

  const feed = await db.feed.findFirst({ where: { id: feedId, shopId } });
  if (!feed) {
    throw new Response("Feed not found", { status: 404 });
  }
  return feed;
}

export async function authenticateFeedRequest(
  request: Request,
  feedId: string | undefined,
): Promise<{
  session: Awaited<ReturnType<typeof authenticate.admin>>["session"];
  redirect: Awaited<ReturnType<typeof authenticate.admin>>["redirect"];
  shop: Shop;
  feed: Feed;
  adapter: FeedAdapter;
}> {
  const { session, redirect } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const feed = await requireFeed(feedId, shop.id);
  const adapter = getAdapter(feed.channel);
  return { session, redirect, shop, feed, adapter };
}