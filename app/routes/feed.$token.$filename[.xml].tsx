import type { LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { findAdapter } from "app/services/feeds/registry";

export async function loader({ params }: LoaderFunctionArgs) {
  const { token, filename } = params;

  if (!token || !filename) {
    return new Response("Not found", { status: 404 });
  }
  const feed = await db.feed.findUnique({
    where: { token },
    select: { channel: true, content: true },
  });

  if (!feed) {
    return new Response("Not found", { status: 404 });
  }

  const adapter = findAdapter(feed.channel);
  if (!adapter || adapter.filename !== `${filename}.xml`) {
    return new Response("Not found", { status: 404 });
  }

  if (!feed.content) {
    return new Response("Feed not generated yet", { status: 404 });
  }

  return new Response(feed.content, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}