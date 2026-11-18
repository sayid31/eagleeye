// src/components/app/rowActionsView.js
/**
 * Pure grouping of RowActions items: ordinary actions first, destructive ones last (rendered below a separator),
 * hidden ones dropped.
 *
 * @module components/app/rowActionsView
 * @typedef {{id: string, label: string, onSelect: () => void, destructive?: boolean, disabled?: boolean, hidden?: boolean}} RowAction
 */

/**
 * @param {RowAction[]} items
 * @returns {{normal: RowAction[], destructive: RowAction[]}}
 */
export function splitActions(items) {
  const visible = items.filter((item) => !item.hidden);
  return { normal: visible.filter((item) => !item.destructive), destructive: visible.filter((item) => item.destructive) };
}
