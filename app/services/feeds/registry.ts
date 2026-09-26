import { FeedAdapter } from "./types";
import { googleAdapter } from "./adapters/google";
import { arukeresoAdapter } from "./adapters/arukereso";

const adaptersRegistry: Record<string, FeedAdapter> = {
  google: googleAdapter,
  arukereso: arukeresoAdapter,
};

export function getAdapter(channel: string): FeedAdapter {
  const adapter = adaptersRegistry[channel];
  if (!adapter) {
    throw new Error(`Unknown feed channel: "${channel}"`);
  }
  return adapter;
}

export function findAdapter(channel: string): FeedAdapter | undefined {
  return adaptersRegistry[channel];
}

export function listAdapters(): FeedAdapter[] {
  return Object.values(adaptersRegistry);
}