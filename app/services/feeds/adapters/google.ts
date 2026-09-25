import { NormalizedProduct } from "app/types/NormalizedProduct";
import { FeedAdapter, FeedRenderResult, FeedRule } from "../types";
import { formatMinor } from "app/utils/money";

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

export const googleRuleMeta: Record<string, { title: string; hint: string }> = {
  MISSING_IMAGE: {
    title: "Missing product image",
    hint: "Upload at least one main product image in your Shopify admin.",
  },
  MISSING_LINK: {
    title: "Missing product link",
    hint: "Ensure the product has a valid SEO handle and is published.",
  },
  PRICE_ZERO: {
    title: "Invalid or zero price",
    hint: "Set a price greater than 0 for all product variants.",
  },
  MISSING_VARIANT_ID: {
    title: "Missing variant ID",
    hint: "Ensure the product variant is properly synced from Shopify.",
  },
  INVALID_GTIN: {
    title: "Invalid GTIN / Barcode",
    hint: "Provide a valid 8, 12, 13 or 14-digit GS1-compliant barcode.",
  },
  NO_CATEGORY: {
    title: "Missing Google Product Category",
    hint: "Assign an official Google product category to this product.",
  },
  NO_BRAND: {
    title: "Missing brand (vendor)",
    hint: "Fill in the vendor/brand field for the product in Shopify.",
  },
  TITLE_TOO_LONG: {
    title: "Title exceeds 150 characters",
    hint: "Shorten the product title to comply with Google Shopping guidelines.",
  },
  EMPTY_DESCRIPTION: {
    title: "Empty product description",
    hint: "Add a description or rich text content to describe the product.",
  },
};

export const googleAdapter: FeedAdapter = {
  channel: "google",
  filename: "google.xml",
  contentType: "application/xml; charset=utf-8",
  descriptor: {
  label: "Google Shopping",
  defaultFeedName: "Google Shopping Feed",
  submitTo: "Google Merchant Center",
  categoryLabel: "Google category",
  categoryHint:
    "Map each of your product types to a Google product category. Unmapped product types are sent without g:google_product_category.",
  customCategoryPlaceholder: "Apparel & Accessories > Clothing > Shirts & Tops",
  rebuildHint:
    "This will compile all active variants and map them into standard Google Merchant Center format.",
  healthSubtitle: "Google Merchant Center catalog diagnostics",
  healthyMessage:
    "No errors or warnings found in your product feed. Your catalog is fully optimized for Google Shopping.",
  taxonomy: "google",                  // NEW
},
  ruleMeta: googleRuleMeta,
  
  rules: [
    {
      code: "MISSING_IMAGE",
      severity: "error",
      check: (product) => !product.images?.[0]?.url,
    },
    {
      code: "MISSING_LINK",
      severity: "error",
      check: (product) => !product.link,
    },
    {
      code: "PRICE_ZERO",
      severity: "error",
      check: (_, variant) => variant.priceMinor === null || variant.priceMinor <= 0,
    },
    {
      code: "MISSING_VARIANT_ID",
      severity: "error",
      check: (_, variant) => !variant.shopifyId,
    },
    {
      code: "INVALID_GTIN",
      severity: "warning",
      check: (_, variant) => {
        const rawGtin = variant.barcode?.trim();
        if (!rawGtin) return false;
        return !isValidGtin(rawGtin);
      },
    },
    {
      code: "NO_CATEGORY",
      severity: "warning",
      check: (product) => !product.category,
    },
    {
      code: "NO_BRAND",
      severity: "warning",
      check: (product) => !product.vendor?.trim(),
    },
    {
      code: "TITLE_TOO_LONG",
      severity: "warning",
      check: (product) => Boolean(product.title && product.title.length > 150),
    },
    {
      code: "EMPTY_DESCRIPTION",
      severity: "warning",
      check: (product) => !product.descriptionHtml && !product.title,
    },
  ],

  render(products: NormalizedProduct[], shopDomain: string, currencyCode: string): FeedRenderResult {
    const exponent = getCurrencyExponentForGoogle(currencyCode);
    const items: GoogleItem[] = [];
    let invalidPriceCount = 0;

    for (const product of products) {
      if (product.status && product.status.toUpperCase() !== "ACTIVE") {
        continue;
      }
      const mainImageUrl = product.images?.[0]?.url;

      for (const variant of product.variants) {
        const variantId = variant.shopifyId;

        const hasPriceError = variant.priceMinor === null || variant.priceMinor <= 0;
        const hasImageError = !mainImageUrl;
        const hasLinkError = !product.link;
        const hasVariantIdError = !variantId;

        if (hasPriceError) {
          invalidPriceCount++;
        }

        if (hasPriceError || hasImageError || hasLinkError || hasVariantIdError) {
          continue;
        }

        const formattedPrice = `${formatMinor(variant.priceMinor!, exponent)} ${currencyCode}`;
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

        items.push({
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
        });
      }
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
      skippedCount: 0, 
      invalidPriceCount,
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

function getCurrencyExponentForGoogle(currencyCode: string): number {
  return currencyCode.toUpperCase() === "HUF" ? 0 : 2;
}

