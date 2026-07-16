import { NormalizedProduct } from "app/types/NormalizedProduct";

export interface FeedAdapter {
  channel: string;
  filename: string;
  render(products: NormalizedProduct[], shopDomain: string): string;
}