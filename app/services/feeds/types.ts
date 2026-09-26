import { NormalizedProduct } from "app/types/NormalizedProduct";
import type { FeedSettings } from "./settings";

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

export interface FeedSummary {
  healthScore: number | null;
  errorCount: number;
  warningCount: number;
  groups: FeedIssueGroup[];
}

export interface FeedIssueGroup {
  code: string;
  severity: Severity;
  productCount: number;
}

export interface ChannelCategory {
  id: string | null;
  path: string;
}

export interface RuleMeta {
  title: string;
  hint: string;
}

export interface RenderContext {
  shopDomain: string;
  currencyCode: string;
  exponent: number;
  settings: FeedSettings;
}

export interface ChannelDescriptor {
  label: string;
  defaultFeedName: string;
  submitTo: string;
  categoryLabel: string;
  categoryHint: string;
  customCategoryPlaceholder: string;
  rebuildHint: string;
  healthSubtitle: string;
  healthyMessage: string;
  taxonomy: string;
  fields: string[];
}

export interface FeedAdapter {
  channel: string;
  filename: string;
  contentType: string;
  descriptor: ChannelDescriptor;
  rules: FeedRule[];
  ruleMeta: Record<string, RuleMeta>;
  render(products: NormalizedProduct[], context: RenderContext): FeedRenderResult;
}