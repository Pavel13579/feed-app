import { NormalizedProduct } from "app/types/NormalizedProduct";
import { FeedRule, FeedIssueInput } from "./types";

export function checkProducts(
  products: NormalizedProduct[],
  rules: FeedRule[]
): FeedIssueInput[] {
  const issues: FeedIssueInput[] = [];

  for (const product of products) {
    if (product.status && product.status.toUpperCase() !== "ACTIVE") {
      continue;
    }

    for (const variant of product.variants) {
      for (const rule of rules) {
        const result = rule.check(product, variant);

        if (result) {
          issues.push({
            code: rule.code,
            severity: rule.severity,
            productId: product.shopifyId,
            variantId: variant.shopifyId,
            message: typeof result === "string" ? result : undefined,
          });
        }
      }
    }
  }

  return issues;
}