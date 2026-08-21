import type { NormalizedProduct } from "app/types/NormalizedProduct";
import type { CategoryMappingRow } from "app/services/feeds/settings";

export function resolveCategory(product: Pick<NormalizedProduct, "productType">, mappingRows: CategoryMappingRow[]): string | null {
  if (!product.productType) return null;

  const row = mappingRows.find((r) => r.productType === product.productType);
  if (!row) return null;

  const value = row.custom ? row.customValue : row.category;
  return value && value.trim() ? value : null;
}