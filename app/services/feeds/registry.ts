import { googleAdapter } from "./adapters/google";
import { FeedAdapter } from "./types";

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