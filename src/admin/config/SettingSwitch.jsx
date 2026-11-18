// src/admin/config/SettingSwitch.jsx
/** A labelled Switch row with its impact sentence, wired with aria-describedby (a Switch needs a visible label + description). */
import { useId } from 'react';
import { Switch } from '@/components/ui/switch';

/** @param {{title: string, description?: string, checked: boolean, onCheckedChange: (on: boolean) => void, disabled?: boolean}} props */
export function SettingSwitch({ title, description, checked, onCheckedChange, disabled = false }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">{title}</label>
        {description ? <p id={`${id}-description`} className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-describedby={description ? `${id}-description` : undefined} className="mt-0.5 shrink-0" />
    </div>
  );
}
