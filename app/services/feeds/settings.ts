import type { Prisma } from "@prisma/client";

export interface CategoryMappingRow {
  productType: string;
  category: string | null;
  custom: boolean;
  customValue: string | null;
}

export interface FeedSettings {
  categoryMapping: CategoryMappingRow[];
}

const EMPTY_FEED_SETTINGS: FeedSettings = {
  categoryMapping: [],
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

export function getFeedSettings(settings: Prisma.JsonValue | null | undefined): FeedSettings {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return { ...EMPTY_FEED_SETTINGS };
  }

  const raw = settings as Record<string, unknown>;
  const categoryMapping = Array.isArray(raw.categoryMapping)
    ? raw.categoryMapping.filter(isCategoryMappingRow)
    : [];

  return { categoryMapping };
}