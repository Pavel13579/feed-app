import type { Product, Variant, Image } from "@prisma/client";
import type { NormalizedProduct, NormalizedVariant } from "../types/NormalizedProduct";
import type { CategoryMappingRow, PriceSettings } from "app/services/feeds/settings";
import { resolveCategory } from "./categoryResolver.server";
import { computeFeedPrice } from "app/utils/price";

export type DbProductWithRelations = Product & {
  variants: Variant[];
  images: Image[];
};

export function dbProductToNormalized(
  product: DbProductWithRelations, 
  shopDomain: string, 
  mappingRows: CategoryMappingRow[],
  priceSettings: PriceSettings,
  exponent: number
): NormalizedProduct {
  const productLink = product.onlineStoreUrl
    ? product.onlineStoreUrl
    : product.handle
      ? `https://${shopDomain}/products/${product.handle}`
      : null;

  const sortedImages = [...product.images]
    .sort((a, b) => a.position - b.position)
    .map((img) => ({
      url: img.url,
      altText: img.altText,
    }));

  const normalizedVariants: NormalizedVariant[] = product.variants.map((v) => {
    const feedPrice = computeFeedPrice(
      {
        price: v.price.toString(),
        compareAtPrice: v.compareAtPrice ? v.compareAtPrice.toString() : null,
      },
      priceSettings,
      exponent
    );

    return {
      id: v.id,
      shopifyId: v.shopifyId,
      sku: v.sku,
      barcode: v.barcode,
      priceMinor: feedPrice.priceMinor,
      salePriceMinor: feedPrice.salePriceMinor,
      inventoryQuantity: v.inventoryQuantity,
      isAvailable: v.inventoryQuantity > 0,
    };
  });

  return {
    id: product.id,
    shopifyId: product.shopifyId,
    title: product.title,
    descriptionHtml: product.descriptionHtml,
    vendor: product.vendor,
    productType: product.productType,
    status: product.status,
    link: productLink, 
    category: resolveCategory({ productType: product.productType }, mappingRows),
    images: sortedImages,
    variants: normalizedVariants,
  };
}