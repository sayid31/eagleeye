// src/components/app/RowActions.jsx
/** The per-row "…" menu: arrow keys, Esc, outside click and typeahead come from Radix; destructive items sit last. */
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { COMMON_COPY } from '@/copy/en/common';
import { splitActions } from './rowActionsView.js';

function Item({ action }) {
  const Icon = action.icon;
  return (
    <DropdownMenuItem variant={action.destructive ? 'destructive' : 'default'} disabled={action.disabled} onSelect={action.onSelect}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {action.label}
    </DropdownMenuItem>
  );
}

/**
 * @param {{label: string, items: Array<{id: string, label: string, onSelect: () => void, icon?: import('react').ElementType,
 *   destructive?: boolean, disabled?: boolean, hidden?: boolean}>, disabled?: boolean}} props
 *   `label` names the row for assistive tech ("Aksi untuk budi@contoh.id").
 */
export function RowActions({ label, items, disabled = false }) {
  const { normal, destructive } = splitActions(items);
  if (normal.length + destructive.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label || COMMON_COPY.moreActions} disabled={disabled}>
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {normal.map((action) => <Item key={action.id} action={action} />)}
        {normal.length > 0 && destructive.length > 0 ? <DropdownMenuSeparator /> : null}
        {destructive.map((action) => <Item key={action.id} action={action} />)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
