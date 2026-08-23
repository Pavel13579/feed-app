import { NormalizedProduct } from "app/types/NormalizedProduct";

export interface FeedRenderResult {
  xml: string;
  itemCount: number;
  skippedCount: number;
}

export interface ChannelCategory {
  id: string;
  path: string;
}

export interface FeedAdapter {
  channel: string;
  filename: string;
  categories: ChannelCategory[];
  render(products: NormalizedProduct[], shopDomain: string, currencyCode: string): FeedRenderResult;
}