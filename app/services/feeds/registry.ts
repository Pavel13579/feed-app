import { googleAdapter } from "./adapters/google";
import { ChannelCategory, FeedAdapter } from "./types";

const adaptersRegistry: Record<string, FeedAdapter> = {
  [googleAdapter.channel]: googleAdapter,
};


export function getAdapter(channel: string): FeedAdapter {
  const adapter = adaptersRegistry[channel];
  
  if (!adapter) {
    throw new Error(`Unsupported feed channel: "${channel}". Register corresponding adapter in registry.ts`);
  }
  
  return adapter;
}


export function getChannelCategories(channel: string): ChannelCategory[] {
  return getAdapter(channel).categories;
}

export function getIssueCodes(channel: string): string[] {
  return getAdapter(channel).rules.map((rule) => rule.code);
}

export function isKnownIssueCode(channel: string, code: string): boolean {
  return getAdapter(channel).rules.some((rule) => rule.code === code);
}

export function listAdapters(): FeedAdapter[] {
  return Object.values(adaptersRegistry);
}

export function findAdapter(channel: string): FeedAdapter | undefined {
  return adaptersRegistry[channel];
}