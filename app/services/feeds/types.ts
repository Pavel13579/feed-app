import { NormalizedProduct } from "app/types/NormalizedProduct";

export type Severity = "error" | "warning";

export type FeedRule = {
  code: string;
  severity: Severity;
  check: (product: NormalizedProduct, variant: any) => boolean | string;
};

export type FeedIssueInput = {
  code: string;
  severity: Severity;
  productId: string;
  variantId: string | null;
  message?: string;
};

export interface FeedRenderResult {
  xml: string;
  itemCount: number;
  skippedCount: number;
  invalidPriceCount: number;
}

export interface ChannelCategory {
  id: string;
  path: string;
}

export interface FeedAdapter {
  channel: string;
  filename: string;
  categories: ChannelCategory[];
  rules: FeedRule[];
  render(products: NormalizedProduct[], shopDomain: string, currencyCode: string): FeedRenderResult;
}