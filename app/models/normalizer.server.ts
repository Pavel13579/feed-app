import type { Product, Variant, Image } from "@prisma/client";
import type { NormalizedProduct, NormalizedVariant } from "../types/NormalizedProduct";

export type DbProductWithRelations = Product & {
  variants: Variant[];
  images: Image[];
};


export function dbProductToNormalized(product: DbProductWithRelations, shopDomain: string): NormalizedProduct {
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

  const normalizedVariants: NormalizedVariant[] = product.variants.map((v) => ({
    id: v.id,
    shopifyId: v.shopifyId,
    sku: v.sku,
    barcode: v.barcode,
    price: v.price.toString(),
    compareAtPrice: v.compareAtPrice ? v.compareAtPrice.toString() : null,
    inventoryQuantity: v.inventoryQuantity,
    isAvailable: v.inventoryQuantity > 0,
  }));

  return {
    id: product.id,
    shopifyId: product.shopifyId,
    title: product.title,
    descriptionHtml: product.descriptionHtml,
    vendor: product.vendor,
    productType: product.productType,
    status: product.status,
    link: productLink, 
    images: sortedImages,
    variants: normalizedVariants,
  };
}