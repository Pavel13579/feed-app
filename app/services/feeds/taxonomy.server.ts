import type { ChannelCategory } from "./types";

const rawModules = import.meta.glob<string>("./taxonomies/*.txt", {
  eager: true,
  query: "?raw",
  import: "default",
});

interface TaxonomySource {
  raw: string;
  hasIds: boolean;
}

const TAXONOMY_SOURCES: Record<string, TaxonomySource> = {};

for (const [path, raw] of Object.entries(rawModules)) {
  const filename = path.split("/").pop() ?? path;
  const key = filename.split(".")[0];
  if (!key) continue;

  const firstContentLine = raw
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  const hasIds = !!firstContentLine && firstContentLine.includes(" - ");

  TAXONOMY_SOURCES[key] = { raw, hasIds };
}

interface ParsedTaxonomy {
  categories: ChannelCategory[];
  byId: Map<string, ChannelCategory>;
  lowerPaths: string[];
}

const cache = new Map<string, ParsedTaxonomy>();

function parseLine(line: string, hasIds: boolean): ChannelCategory | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  if (hasIds) {
    const separatorIndex = trimmed.indexOf(" - ");
    if (separatorIndex === -1) return null;
    const id = trimmed.slice(0, separatorIndex).trim();
    const path = trimmed.slice(separatorIndex + 3).trim();
    if (!id || !path) return null;
    return { id, path };
  }

  return { id: null, path: trimmed };
}

function parseTaxonomy(key: string): ParsedTaxonomy {
  const source = TAXONOMY_SOURCES[key];
  if (!source) throw new Error(`Unknown taxonomy key: "${key}"`);

  const categories: ChannelCategory[] = [];
  const byId = new Map<string, ChannelCategory>();

  for (const line of source.raw.split("\n")) {
    const category = parseLine(line, source.hasIds);
    if (!category) continue;
    categories.push(category);
    if (category.id) byId.set(category.id, category);
  }

  return { categories, byId, lowerPaths: categories.map((c) => c.path.toLowerCase()) };
}

function getTaxonomy(key: string): ParsedTaxonomy {
  let parsed = cache.get(key);
  if (!parsed) {
    parsed = parseTaxonomy(key);
    cache.set(key, parsed);
  }
  return parsed;
}

export function isKnownTaxonomy(key: string): boolean {
  return key in TAXONOMY_SOURCES;
}

const SEARCH_LIMIT = 25;

export function searchTaxonomy(key: string, query: string): ChannelCategory[] {
  const { categories, lowerPaths } = getTaxonomy(key);
  const q = query.trim().toLowerCase();

  if (!q) return categories.slice(0, SEARCH_LIMIT);

  const prefixMatches: ChannelCategory[] = [];
  const substringMatches: ChannelCategory[] = [];

  for (let i = 0; i < categories.length; i++) {
    const lowerPath = lowerPaths[i];
    const lastSegment = lowerPath.slice(lowerPath.lastIndexOf(">") + 1).trim();

    if (lastSegment.startsWith(q) || lowerPath.startsWith(q)) {
      prefixMatches.push(categories[i]);
      if (prefixMatches.length >= SEARCH_LIMIT) break;
    } else if (lowerPath.includes(q) && substringMatches.length < SEARCH_LIMIT) {
      substringMatches.push(categories[i]);
    }
  }

  const results = prefixMatches.slice(0, SEARCH_LIMIT);
  if (results.length < SEARCH_LIMIT) {
    results.push(...substringMatches.slice(0, SEARCH_LIMIT - results.length));
  }
  return results;
}


export function resolveStoredCategoryValue(key: string, value: string): string {
  if (!/^\d+$/.test(value) || !isKnownTaxonomy(key)) return value;
  return getTaxonomy(key).byId.get(value)?.path ?? value;
}