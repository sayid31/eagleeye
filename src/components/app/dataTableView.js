// src/components/app/dataTableView.js
/**
 * Pure view-model of DataTable: which of the four states to show, and the server pagination line ("21–40 dari 45",
 * previous/next offsets). Offsets and limits mirror the admin API (`?limit=&offset=`, reply `{total, limit, offset}`).
 *
 * @module components/app/dataTableView
 */
import { TABLE_COPY } from '../../copy/en/common.js';

export const PAGE_SIZES = Object.freeze([10, 20, 50]);
export const DEFAULT_PAGE_SIZE = 20;

/**
 * State to render. An error always wins; the first load (no rows yet) shows the skeleton; a reload over existing rows
 * keeps showing them (`refreshing`).
 * @param {{loading?: boolean, error?: unknown, rowCount: number}} input
 * @returns {{state: 'loading' | 'error' | 'empty' | 'ready', refreshing: boolean}}
 */
export function tableState({ loading = false, error = null, rowCount }) {
  if (error) return { state: 'error', refreshing: false };
  if (loading && rowCount === 0) return { state: 'loading', refreshing: false };
  if (rowCount === 0) return { state: 'empty', refreshing: false };
  return { state: 'ready', refreshing: loading };
}

/**
 * Pagination line and neighbours for a `{total, limit, offset}` page; `visible` is false when everything fits on one
 * page at the smallest page size (nothing to page through, nothing to choose).
 * @param {{total: number, limit: number, offset: number, sizes?: readonly number[]}} page
 * @returns {{from: number, to: number, total: number, label: string, prevOffset: number | null, nextOffset: number | null, visible: boolean}}
 */
export function paginationView({ total, limit, offset, sizes = PAGE_SIZES }) {
  const safeTotal = Math.max(0, Number.isFinite(total) ? total : 0);
  const from = safeTotal === 0 ? 0 : Math.min(offset + 1, safeTotal);
  const to = Math.min(offset + limit, safeTotal);
  return {
    from, to, total: safeTotal,
    label: TABLE_COPY.range(from, to, safeTotal),
    prevOffset: offset > 0 ? Math.max(0, offset - limit) : null,
    nextOffset: offset + limit < safeTotal ? offset + limit : null,
    visible: safeTotal > Math.min(...sizes),
  };
}
