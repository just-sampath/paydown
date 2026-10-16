import type { PageId } from '../components/Layout';

const PAGE_IDS = new Set<PageId>(['dashboard', 'schedule', 'rates', 'parts', 'whatif', 'settings']);

export function pageFromHash(hash: string): PageId {
  const candidate = hash.replace(/^#/, '') as PageId;
  return PAGE_IDS.has(candidate) ? candidate : 'dashboard';
}
