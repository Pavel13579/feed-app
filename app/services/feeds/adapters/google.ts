import { NormalizedProduct } from "app/types/NormalizedProduct";
import { FeedAdapter, FeedRenderResult } from "../types";
import { googleCategories } from "./google-categories";
import { formatMinor, getCurrencyExponent } from "app/utils/money";

interface GoogleItem {
  id: string;                     
  item_group_id: string;          
  title: string;                 
  description: string;           
  link: string;                  
  image_link: string;            
  availability: "in_stock" | "out_of_stock"; 
  price: string;                 
  sale_price: string | null;     
  condition: "new";              
  brand: string | null;          
  gtin: string | null;           
  mpn: string | null;            
  identifier_exists: "true" | "false";
  google_product_category: string | null;
  product_type: string | null;
}

export function mapProductsToGoogleItems(
  products: NormalizedProduct[], 
  currencyCode: string, 
  exponent: number
): { items: GoogleItem[]; skippedCount: number } {
  const items: GoogleItem[] = [];
  let skippedCount = 0;

  for (const product of products) {
    if (product.status && product.status.toUpperCase() !== "ACTIVE") {
      skippedCount += product.variants.length;
      continue;
    }
    const mainImageUrl = product.images?.[0]?.url;

    for (const variant of product.variants) {
      const variantId = variant.shopifyId;

      if (!variantId || !mainImageUrl || !product.link || !currencyCode) {
        skippedCount++;
        continue;
      }

      const formattedPrice = `${formatMinor(variant.priceMinor, exponent)} ${currencyCode}`;
      const formattedSalePrice = variant.salePriceMinor !== null
        ? `${formatMinor(variant.salePriceMinor, exponent)} ${currencyCode}`
        : null;

      const rawGtin = variant.barcode?.trim() || null;
      const gtin = isValidGtin(rawGtin) ? rawGtin : null; 
      const mpn = variant.sku?.trim() || null;
      const brand = product.vendor?.trim() || null;
      
      const hasUniqueIdentifier = !!(gtin || mpn);
      const identifierExists: "true" | "false" = hasUniqueIdentifier ? "true" : "false";

      const itemLink = `${product.link}?variant=${variantId}`;

      const googleItem: GoogleItem = {
        id: variant.shopifyId,    
        item_group_id: product.shopifyId,
        title: product.title,
        description: product.descriptionHtml || product.title, 
        link: itemLink,
        image_link: mainImageUrl,
        availability: variant.isAvailable ? "in_stock" : "out_of_stock",
        price: formattedPrice,
        sale_price: formattedSalePrice,
        condition: "new",
        brand: brand,
        gtin: gtin,
        mpn: mpn,
        identifier_exists: identifierExists,
        google_product_category: product.category,
        product_type: product.productType,
      };

      items.push(googleItem);
    }
  }

  return { items, skippedCount };
}

export const googleAdapter: FeedAdapter = {
  channel: "google",
  filename: "google.xml",
  categories: googleCategories,
  
  render(products: NormalizedProduct[], shopDomain: string, currencyCode: string): FeedRenderResult {
    const exponent = getCurrencyExponent(currencyCode);
    const { items, skippedCount } = mapProductsToGoogleItems(products, currencyCode, exponent);

    if (skippedCount > 0) {
      console.warn(`Google Adapter: skipped ${skippedCount} invalid items.`);
    }

    const xmlItems = items.map((item) => {
      const fields: string[] = [
        `       <g:id>${escapeXml(item.id)}</g:id>`,
        `       <g:item_group_id>${escapeXml(item.item_group_id)}</g:item_group_id>`,
        `       <title>${escapeXml(item.title)}</title>`,
        `       <description>${wrapInCData(item.description)}</description>`,
        `       <link>${escapeXml(item.link)}</link>`,
        `       <g:image_link>${escapeXml(item.image_link)}</g:image_link>`,
        `       <g:availability>${item.availability}</g:availability>`,
        `       <g:price>${escapeXml(item.price)}</g:price>`,
      ];

      if (item.sale_price) {
        fields.push(`       <g:sale_price>${escapeXml(item.sale_price)}</g:sale_price>`);
      }

      fields.push(
        `       <g:condition>${item.condition}</g:condition>`,
        `       <g:identifier_exists>${item.identifier_exists}</g:identifier_exists>`
      );

      if (item.brand) {
        fields.push(`       <g:brand>${escapeXml(item.brand)}</g:brand>`);
      }
      if (item.gtin) {
        fields.push(`       <g:gtin>${escapeXml(item.gtin)}</g:gtin>`);
      }
      if (item.mpn) {
        fields.push(`       <g:mpn>${escapeXml(item.mpn)}</g:mpn>`);
      }
      if (item.google_product_category) {
        fields.push(`       <g:google_product_category>${escapeXml(item.google_product_category)}</g:google_product_category>`);
      }
      if (item.product_type) {
        fields.push(`       <g:product_type>${escapeXml(item.product_type)}</g:product_type>`);
      }

      return `<item>\n${fields.join('\n')}\n</item>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="utf-8"?>
            <rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
            <channel>
              <title>${escapeXml(shopDomain)} Store Feed</title>
              <link>https://${escapeXml(shopDomain)}</link>
              <description>Google Merchant Center Product Feed</description>
          ${xmlItems}
            </channel>
          </rss>`;

    return {
      xml,
      itemCount: items.length,
      skippedCount,
    };
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
  const cleanHtml = html.replace(/]]>/g, ']]]]><![CDATA[>');
  return `<![CDATA[${cleanHtml}]]>`;
}