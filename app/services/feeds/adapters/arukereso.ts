import { NormalizedProduct } from "app/types/NormalizedProduct";
import { FeedAdapter, RuleMeta, RenderContext } from "../types";
import { formatMinor } from "app/utils/money";
import { tag, cdataTag } from "../xml";

interface ArukeresoItem {
  identifier: string;
  manufacturer: string | null;
  name: string;
  category: string | null;
  product_url: string;
  price: string;       
  image_url: string;
  ean_code: string | null;
  description: string | null;
  delivery_time: string;
  delivery_cost: string | null;
}

let shopCurrencyCode: string | null = null;

function isValidEan(value: string): boolean {
  return /^\d{8,13}$/.test(value);
}

export const arukeresoRuleMeta: Record<string, RuleMeta> = {
  NOT_HUF: {
    title: "Store currency is not HUF",
    hint: "Árukereső only accepts prices in Hungarian forint (HUF), without a currency code in the value. This feed cannot be submitted until the store's currency is HUF.",
  },
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
  NO_CATEGORY: {
    title: "Missing category",
    hint: "Category is required by Árukereső. Map this product type to a category in Settings.",
  },
  NO_EAN: {
    title: "Missing or invalid EAN",
    hint: "Add an 8–13 digit EAN/barcode. Without it, Árukereső cannot match this offer to an existing product card.",
  },
};

export const arukeresoAdapter: FeedAdapter = {
  channel: "arukereso",
  filename: "arukereso.xml",
  contentType: "application/xml; charset=utf-8",
  descriptor: {
    label: "Árukereső",
    defaultFeedName: "Árukereső Feed",
    submitTo: "Árukereső Partner Portal",
    categoryLabel: "Árukereső category",
    categoryHint:
      "Map each of your product types to a category from your own catalog structure. Category is required — product types without one are reported as an error, not a warning.",
    customCategoryPlaceholder: "Otthon és kert > Bútorok",
    rebuildHint:
      "This will compile all active, in-stock variants into the Árukereső XML product format.",
    healthSubtitle: "Árukereső feed diagnostics",
    healthyMessage:
      "No errors or warnings found in your product feed. Your catalog is ready for Árukereső.",
    taxonomy: "arukereso",
    fields: ["delivery_time", "delivery_cost"],
  },

  ruleMeta: arukeresoRuleMeta,

  rules: [
    {
      code: "NOT_HUF",
      severity: "error",
      check: () => shopCurrencyCode !== null && shopCurrencyCode !== "HUF",
    },
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
      code: "NO_CATEGORY",
      severity: "error",
      check: (product) => !product.category,
    },
    {
      code: "NO_EAN",
      severity: "warning",
      check: (_, variant) => {
        const raw = variant.barcode?.trim();
        return !raw || !isValidEan(raw);
      },
    },
  ],

  prepareHealthCheck(context: RenderContext) {
    shopCurrencyCode = context.currencyCode;
  },

  render(products: NormalizedProduct[], context: RenderContext) {
    const { settings } = context;
    const exponent = 0;
    const items: ArukeresoItem[] = [];
    let invalidPriceCount = 0;
    let skippedCount = 0;

    const deliveryTimeTag = String(settings.delivery.timeDays);
    const deliveryCostTag =
      settings.delivery.costMajor === null
        ? null
        : settings.delivery.costMajor === 0
          ? "ingyenes"
          : String(settings.delivery.costMajor);

    for (const product of products) {
      if (product.status && product.status.toUpperCase() !== "ACTIVE") continue;

      const mainImageUrl = product.images?.[0]?.url;

      for (const variant of product.variants) {
        if (!variant.isAvailable) {
          skippedCount++;
          continue;
        }

        const hasPriceError = variant.priceMinor === null || variant.priceMinor <= 0;
        if (hasPriceError) invalidPriceCount++;

        const hasImageError = !mainImageUrl;
        const hasLinkError = !product.link;
        const hasVariantIdError = !variant.shopifyId;
        const hasCategoryError = !product.category;

        if (hasPriceError || hasImageError || hasLinkError || hasVariantIdError || hasCategoryError) {
          skippedCount++;
          continue;
        }

        const currentPriceMinor = variant.salePriceMinor ?? variant.priceMinor!;
        const rawEan = variant.barcode?.trim() || null;

        items.push({
          identifier: variant.shopifyId,
          manufacturer: product.vendor?.trim() || null,
          name: product.title,
          category: product.category,
          product_url: `${product.link}?variant=${variant.shopifyId}`,
          price: formatMinor(currentPriceMinor, exponent),
          image_url: mainImageUrl!,
          ean_code: rawEan && isValidEan(rawEan) ? rawEan : null,
          description: product.descriptionHtml,
          delivery_time: deliveryTimeTag,
          delivery_cost: deliveryCostTag,
        });
      }
    }

    const xmlItems = items
      .map((item) => {
        const fields = [
          tag("identifier", item.identifier),
          tag("manufacturer", item.manufacturer),
          tag("name", item.name),
          tag("category", item.category),
          tag("product_url", item.product_url),
          tag("price", item.price),
          tag("image_url", item.image_url),
          tag("ean_code", item.ean_code),
          cdataTag("description", item.description),
          tag("delivery_time", item.delivery_time),
          tag("delivery_cost", item.delivery_cost),
        ].filter((line): line is string => line !== null);

        return `<product>\n${fields.join("\n")}\n</product>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="utf-8"?>\n<products>\n${xmlItems}\n</products>`;

    return {
      xml,
      itemCount: items.length,
      skippedCount,
      invalidPriceCount,
    };
  },
};