import { NormalizedProduct } from "app/types/NormalizedProduct";
import { FeedAdapter } from "../types";

export const googleAdapter: FeedAdapter = {
  channel: "google",
  filename: "googleFeed.xml",
  
  render(products: NormalizedProduct[], shopDomain: string): string {
    return "";
  }
};