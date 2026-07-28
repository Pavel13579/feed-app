import { NormalizedProduct } from "app/types/NormalizedProduct";

export interface FeedRenderResult {
  xml: string;
  itemCount: number;
  skippedCount: number;
}

export interface FeedAdapter {
  channel: string;
  filename: string;
  render(products: NormalizedProduct[], shopDomain: string, currencyCode: string): FeedRenderResult;
}