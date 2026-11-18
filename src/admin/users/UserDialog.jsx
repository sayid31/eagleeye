/** Dialog frame of the Pengguna dialogs: width, scrolling on short screens, and focus returning to what opened it. */
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useReturnFocus } from '@/lib/useReturnFocus';

/**
 * @param {{open: boolean, onOpenChange: (open: boolean) => void, children: import('react').ReactNode, onOpenAutoFocus?: (event: Event) => void}} props
 */
export function UserDialog({ open, onOpenChange, children, onOpenAutoFocus }) {
  const returnFocus = useReturnFocus(open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-lg" onCloseAutoFocus={returnFocus} onOpenAutoFocus={onOpenAutoFocus}>
        {children}
      </DialogContent>
    </Dialog>
  );
}
