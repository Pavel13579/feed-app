import { toMinor } from "./money";
import type { PriceSettings } from "app/services/feeds/settings";

export interface FeedVariantPrice {
  price: string;
  compareAtPrice: string | null;
}

export interface FeedPriceResult {
  priceMinor: number;
  salePriceMinor: number | null;
}

/**
 * Single-point final rounding pipeline (Contract M-6.3):
 * Applies adjustments and taxes sequentially using high-precision math
 */
function applyPricingPipeline(
  baseMinor: number,
  settings: PriceSettings,
  exponent: number,
): number {
  let currentVal = baseMinor;

  if (settings.mode === "web_plus" || settings.mode === "web_minus") {
    if (settings.adjustmentType === "percent") {
      const percent = Number(settings.adjustmentValue);
      const bps = Math.round(percent * 100);
      const delta = (baseMinor * bps) / 10000;
      currentVal = settings.mode === "web_plus" ? baseMinor + delta : baseMinor - delta;
    } else {
      const fixedMinor = toMinor(settings.adjustmentValue, exponent);
      currentVal = settings.mode === "web_plus" ? baseMinor + fixedMinor : baseMinor - fixedMinor;
    }
  }

  if (settings.taxPercent !== null) {
    const taxBps = Math.round(settings.taxPercent * 100);
    currentVal = currentVal * (1 + taxBps / 10000);
  }

  return Math.round(currentVal);
}

export function computeFeedPrice(
  variant: FeedVariantPrice,
  settings: PriceSettings,
  exponent: number,
): FeedPriceResult | null {
  const priceMinor = toMinor(variant.price, exponent);
  const compareAtMinor = variant.compareAtPrice !== null ? toMinor(variant.compareAtPrice, exponent) : null;

  const hasValidDiscount = compareAtMinor !== null && compareAtMinor > priceMinor;

  let regular = hasValidDiscount ? (compareAtMinor as number) : priceMinor;
  let sale = settings.mode === "undiscounted" ? null : (hasValidDiscount ? priceMinor : null);

  if (settings.mode === "web_plus" || settings.mode === "web_minus" || settings.taxPercent !== null) {
    regular = applyPricingPipeline(regular, settings, exponent);
    if (sale !== null) {
      sale = applyPricingPipeline(sale, settings, exponent);
    }
  }

  if (regular <= 0) {
    return null;
  }

  if (sale !== null && sale <= 0) {
    sale = null;
  }
  if (sale !== null && sale >= regular) {
    sale = null;
  }

  return { priceMinor: regular, salePriceMinor: sale };
}