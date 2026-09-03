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

function applyPercent(baseMinor: number, percent: number): number {
  const bps = Math.round(percent * 100);
  return Math.round((baseMinor * bps) / 10000);
}

function fixedAdjustmentToMinor(adjustmentValue: number, exponent: number): number {
  return toMinor(adjustmentValue.toFixed(exponent), exponent);
}

function applyAdjustment(minor: number, settings: PriceSettings, exponent: number): number {
  const delta =
    settings.adjustmentType === "percent"
      ? applyPercent(minor, settings.adjustmentValue)
      : fixedAdjustmentToMinor(settings.adjustmentValue, exponent);

  return settings.mode === "web_plus" ? minor + delta : minor - delta;
}

function applyTax(minor: number, taxPercent: number | null): number {
  if (taxPercent === null) return minor;
  return minor + applyPercent(minor, taxPercent);
}

export function computeFeedPrice(
  variant: FeedVariantPrice,
  settings: PriceSettings,
  exponent: number,
): FeedPriceResult | null {
  const priceMinor = toMinor(variant.price, exponent);
  const compareAtMinor = variant.compareAtPrice !== null ? toMinor(variant.compareAtPrice, exponent) : null;

  const hasValidDiscount = compareAtMinor !== null && compareAtMinor > priceMinor;

  let regular: number;
  let sale: number | null;

  if (settings.mode === "undiscounted") {
    regular = hasValidDiscount ? (compareAtMinor as number) : priceMinor;
    sale = null;
  } else {
    regular = hasValidDiscount ? (compareAtMinor as number) : priceMinor;
    sale = hasValidDiscount ? priceMinor : null;
  }

  if (settings.mode === "web_plus" || settings.mode === "web_minus") {
    regular = applyAdjustment(regular, settings, exponent);
    if (sale !== null) sale = applyAdjustment(sale, settings, exponent);
  }

  regular = applyTax(regular, settings.taxPercent);
  if (sale !== null) sale = applyTax(sale, settings.taxPercent);

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