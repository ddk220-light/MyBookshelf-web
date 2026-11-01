import { post } from './api';
import type { ContentItem, ContentKind, ContentPage, ContentSourceStatus } from './contentTypes';
export const contentApi = {
  async locate(identifiers:{isbn13?:string;workId?:string},signal?:AbortSignal):Promise<ContentItem[]> {
    return (await post<{items:ContentItem[]}>('/content/locate',{...identifiers},signal)).items;
  },
  search(query: string, kinds: ContentKind[], options: { cursor?: string; includeUnclear?: boolean; languages?: string[]; sourceIds?:string[]; retrySource?:string;collection?:'children';level?:string } = {}, signal?: AbortSignal, progress?:(source:ContentSourceStatus)=>void): Promise<ContentPage> {
    return post('/content/search', { query, kinds, access: 'free', limit: 20, ...options }, signal,progress);
  },
  async resolve(key: string, signal?: AbortSignal): Promise<ContentItem> {
    return (await post<{ item: ContentItem }>('/content/resolve', { key }, signal)).item;
  },
};
