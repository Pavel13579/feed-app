import { NormalizedProduct } from "app/types/NormalizedProduct";
import { FeedAdapter, GoogleItem } from "../types";

export function mapProductsToGoogleItems(products: NormalizedProduct[]): { items: GoogleItem[]; skippedCount: number } {
  const items: GoogleItem[] = [];
  let skippedCount = 0;

  for (const product of products) {
    const mainImageUrl = product.images?.[0]?.url;

    for (const variant of product.variants) {
      const variantId = variant.shopifyId;
      const priceValue = variant.price; 

      if (!variantId || !priceValue || !mainImageUrl) {
        skippedCount++;
        continue;
      }

      const variantCurrency = variant.currency || "HUF"; 
      const formattedPrice = `${priceValue} ${variantCurrency}`;

      const brand = product.vendor || null;
      const gtin = variant.barcode || null;
      const mpn = variant.sku || null;
      
      const hasIdentifiers = !!(brand || gtin || mpn);
      const identifierExists: "true" | "false" = hasIdentifiers ? "true" : "false";

      const itemLink = variant.shopifyId 
        ? `${product.link}?variant=${variant.shopifyId.replace('gid://shopify/ProductVariant/', '')}`
        : product.link;

      const googleItem: GoogleItem = {
        id: variant.shopifyId, 
        
        item_group_id: product.shopifyId,
        
        title: product.title,
        description: product.descriptionHtml || product.title, 
        link: itemLink,
        image_link: mainImageUrl,
        availability: variant.isAvailable ? "in_stock" : "out_of_stock",
        price: formattedPrice,
        condition: "new",
        brand: brand,
        gtin: gtin,
        mpn: mpn,
        identifier_exists: identifierExists,
      };

      items.push(googleItem);
    }
  }

  return { items, skippedCount };
}

export const googleAdapter: FeedAdapter = {
  channel: "google",
  filename: "googleFeed.xml",
  
  render(products: NormalizedProduct[], shopDomain: string): string {
    const { items, skippedCount } = mapProductsToGoogleItems(products);

    if (skippedCount > 0) {
      console.warn(`Google Adapter: skipped ${skippedCount} invalid items.`);
    }

    return JSON.stringify(items, null, 2);
  }
};


