import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { authenticateFeedRequest } from "app/models/feedAccess.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { redirect } = await authenticate.admin(request);
  return redirect("/app/feeds");
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { feed, redirect } = await authenticateFeedRequest(request, params.feedId);
  await db.feed.delete({ where: { id: feed.id } });

  return redirect("/app/feeds");
};