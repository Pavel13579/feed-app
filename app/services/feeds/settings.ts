import type { Prisma } from "@prisma/client";

export interface CategoryMappingRow {
  productType: string;
  category: string | null;
  custom: boolean;
  customValue: string | null;
}

export type PriceMode = "as_is" | "undiscounted" | "web_plus" | "web_minus";
export type PriceAdjustmentType = "percent" | "fixed";

export const PRICE_MODES: readonly PriceMode[] = ["as_is", "undiscounted", "web_plus", "web_minus"];
export const PRICE_ADJUSTMENT_TYPES: readonly PriceAdjustmentType[] = ["percent", "fixed"];

export interface PriceSettings {
  mode: PriceMode;
  adjustmentType: PriceAdjustmentType;
  adjustmentValue: number;
  taxPercent: number | null;
}

export interface FeedSettings {
  categoryMapping: CategoryMappingRow[];
  price: PriceSettings;
}

const DEFAULT_PRICE_SETTINGS: PriceSettings = {
  mode: "as_is",
  adjustmentType: "percent",
  adjustmentValue: 0,
  taxPercent: null,
};

const EMPTY_FEED_SETTINGS: FeedSettings = {
  categoryMapping: [],
  price: DEFAULT_PRICE_SETTINGS,
};

function isCategoryMappingRow(value: unknown): value is CategoryMappingRow {
  if (!value || typeof value !== "object") return false;

  const row = value as Record<string, unknown>;
  return (
    typeof row.productType === "string" &&
    (row.category === null || typeof row.category === "string") &&
    typeof row.custom === "boolean" &&
    (row.customValue === null || typeof row.customValue === "string")
  );
}

export function isValidPriceSettings(value: unknown): value is PriceSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;

  if (!PRICE_MODES.includes(v.mode as PriceMode)) return false;
  if (!PRICE_ADJUSTMENT_TYPES.includes(v.adjustmentType as PriceAdjustmentType)) return false;
  if (typeof v.adjustmentValue !== "number" || !Number.isFinite(v.adjustmentValue) || v.adjustmentValue < 0) {
    return false;
  }
  if (
    v.taxPercent !== null &&
    (typeof v.taxPercent !== "number" || !Number.isFinite(v.taxPercent) || v.taxPercent < 0 || v.taxPercent > 100)
  ) {
    return false;
  }

  return true;
}

function resolvePriceSettings(value: unknown): PriceSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_PRICE_SETTINGS };
  }
  const raw = value as Record<string, unknown>;

  const mode = PRICE_MODES.includes(raw.mode as PriceMode) ? (raw.mode as PriceMode) : DEFAULT_PRICE_SETTINGS.mode;

  const adjustmentType = PRICE_ADJUSTMENT_TYPES.includes(raw.adjustmentType as PriceAdjustmentType)
    ? (raw.adjustmentType as PriceAdjustmentType)
    : DEFAULT_PRICE_SETTINGS.adjustmentType;

  const adjustmentValue =
    typeof raw.adjustmentValue === "number" && Number.isFinite(raw.adjustmentValue) && raw.adjustmentValue >= 0
      ? raw.adjustmentValue
      : DEFAULT_PRICE_SETTINGS.adjustmentValue;

  const taxPercent =
    raw.taxPercent === null
      ? null
      : typeof raw.taxPercent === "number" &&
          Number.isFinite(raw.taxPercent) &&
          raw.taxPercent >= 0 &&
          raw.taxPercent <= 100
        ? raw.taxPercent
        : DEFAULT_PRICE_SETTINGS.taxPercent;

  return { mode, adjustmentType, adjustmentValue, taxPercent };
}

export function getFeedSettings(settings: Prisma.JsonValue | null | undefined): FeedSettings {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return { ...EMPTY_FEED_SETTINGS, price: { ...DEFAULT_PRICE_SETTINGS } };
  }

  const raw = settings as Record<string, unknown>;
  const categoryMapping = Array.isArray(raw.categoryMapping)
    ? raw.categoryMapping.filter(isCategoryMappingRow)
    : [];
  const price = resolvePriceSettings(raw.price);

  return { categoryMapping, price };
}