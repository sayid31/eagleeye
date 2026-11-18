// src/admin/config/KeySheet.jsx
/** The "Ubah kunci" Sheet: opened from code (a row button), so it returns focus to that button on close. */
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useReturnFocus } from '@/lib/useReturnFocus';
import { KeySheetBody } from './KeySheetBody.jsx';

/** @param {{row: object | null, onOpenChange: (open: boolean) => void, onSaved: (reply: object) => void, onTested: (id: string, outcome: object) => void}} props `row` null = closed. */
export function KeySheet({ row, onOpenChange, onSaved, onTested }) {
  const open = row !== null;
  const returnFocus = useReturnFocus(open);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md" onCloseAutoFocus={returnFocus}>
        {row ? <KeySheetBody row={row} onClose={() => onOpenChange(false)} onSaved={onSaved} onTested={onTested} /> : null}
      </SheetContent>
    </Sheet>
  );
}
