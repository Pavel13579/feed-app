import { NormalizedProduct } from "app/types/NormalizedProduct";
import { FeedRule, FeedIssueInput, Severity, FeedSummary, FeedIssueGroup } from "./types";

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



export function summarize(issues: FeedIssueInput[], itemCount: number): FeedSummary {
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  let healthScore: number | null = null;
  const denominator = itemCount + errorCount;
  
  if (denominator > 0) {
    healthScore = Math.round((itemCount / denominator) * 100);
  } else if (itemCount === 0 && errorCount === 0) {
    healthScore = null;
  }

  const groupMap = new Map<string, { severity: Severity; productIds: Set<string> }>();

  for (const issue of issues) {
    const key = issue.code;
    if (!groupMap.has(key)) {
      groupMap.set(key, { severity: issue.severity, productIds: new Set() });
    }
    groupMap.get(key)!.productIds.add(issue.productId);
  }

  const groups: FeedIssueGroup[] = Array.from(groupMap.entries()).map(([code, data]) => ({
    code,
    severity: data.severity,
    productCount: data.productIds.size,
  }));

  groups.sort((a, b) => {
    if (a.severity === "error" && b.severity === "warning") return -1;
    if (a.severity === "warning" && b.severity === "error") return 1;
    return b.productCount - a.productCount;
  });

  return {
    healthScore,
    errorCount,
    warningCount,
    groups,
  };
}