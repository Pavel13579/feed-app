import type { LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const token = params.token;

  if (!token) {
    return new Response("Token is required", { status: 400 });
  }

  const feed = await db.feed.findUnique({
    where: { token },
  });

  return new Response(feed?.content || "");
}