import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { isKnownTaxonomy, searchTaxonomy } from "app/services/feeds/taxonomy.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  const q = url.searchParams.get("q") ?? "";

  if (!isKnownTaxonomy(key)) {
    return json({ results: [] }, { status: 400 });
  }

  return json({ results: searchTaxonomy(key, q) });
};