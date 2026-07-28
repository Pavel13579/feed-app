import type { LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const token = params.token;

  if (!token) {
    return new Response("Token is required", { status: 400 });
  }

  const feed = await db.feed.findUnique({ where: { token } });

  if (!feed) {
    return new Response("Not found", { status: 404 });
  }

  if (!feed.content) {
    return new Response("Feed not generated yet", { status: 404 });
  }

  return new Response(feed.content, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}