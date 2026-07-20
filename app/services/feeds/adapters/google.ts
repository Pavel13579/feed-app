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

      const rawGtin = variant.barcode?.trim() || null;

      const gtin = isValidGtin(rawGtin) ? rawGtin : null; 
      const mpn = variant.sku?.trim() || null;
      const brand = product.vendor?.trim() || null;
      
      const hasUniqueIdentifier = !!(gtin || mpn);
      const identifierExists: "true" | "false" = hasUniqueIdentifier ? "true" : "false";

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
  
  render(products: NormalizedProduct[], shopDomain: string, context?: { skippedCount: number }): string {
    const { items, skippedCount } = mapProductsToGoogleItems(products);

    if (skippedCount > 0) {
      console.warn(`Google Adapter: skipped ${skippedCount} invalid items.`);
    }

    if (context) {
      context.skippedCount = skippedCount;
    }

    const xmlItems = items.map((item) => {
      const fields: string[] = [
        `      <g:id>${escapeXml(item.id)}</g:id>`,
        `      <g:item_group_id>${escapeXml(item.item_group_id)}</g:item_group_id>`,
        `      <title>${escapeXml(item.title)}</title>`,
        `      <description>${wrapInCData(item.description)}</description>`,
        `      <link>${escapeXml(item.link)}</link>`,
        `      <g:image_link>${escapeXml(item.image_link)}</g:image_link>`,
        `      <g:availability>${item.availability}</g:availability>`,
        `      <g:price>${escapeXml(item.price)}</g:price>`,
        `      <g:condition>${item.condition}</g:condition>`,
        `      <g:identifier_exists>${item.identifier_exists}</g:identifier_exists>`
      ];

      if (item.brand) {
        fields.push(`<g:brand>${escapeXml(item.brand)}</g:brand>`);
      }
      if (item.gtin) {
        fields.push(`<g:gtin>${escapeXml(item.gtin)}</g:gtin>`);
      }
      if (item.mpn) {
        fields.push(`<g:mpn>${escapeXml(item.mpn)}</g:mpn>`);
      }

      return `<item>\n${fields.join('\n')}\n</item>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="utf-8"?>
            <rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
            <channel>
              <title>${escapeXml(shopDomain)} Store Feed</title>
              <link>https://${escapeXml(shopDomain)}</link>
              <description>Google Merchant Center Product Feed</description>
          ${xmlItems}
            </channel>
          </rss>`;
  }
};

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return char;
    }
  });
}


function isValidGtin(gtin: string | null | undefined): boolean {
  if (!gtin) return false;
  const cleanGtin = gtin.trim();
  return /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(cleanGtin);
}

function wrapInCData(html: string): string {
  const cleanHtml = html.replace(/\]\]>/g, ']]&gt;');
  return `<![CDATA[${cleanHtml}]]>`;
}
