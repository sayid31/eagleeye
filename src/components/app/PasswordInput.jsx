// src/components/app/PasswordInput.jsx
/**
 * The one password field of the product (replaces login/PasswordInput and admin SecretInput): show/hide toggle with
 * aria-pressed, correct autocomplete, paste always allowed (WCAG 3.3.8), optional minimum-length hint.
 */
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PASSWORD_INPUT_COPY } from '@/copy/en/common';
import { cn } from '@/lib/utils';

/**
 * Props are those of a native `<input>` (value/onChange/name/id/aria-*), plus:
 * @param {{autoComplete?: 'current-password' | 'new-password' | 'off', revealDisabled?: boolean, className?: string}} props
 *   `autoComplete`: `current-password` for sign-in, `new-password` when choosing one, `off` for pasted API keys.
 */
export function PasswordInput({ autoComplete = 'current-password', revealDisabled = false, className, disabled, ...rest }) {
  const [visible, setVisible] = useState(false);
  const label = visible ? PASSWORD_INPUT_COPY.hide : PASSWORD_INPUT_COPY.show;
  return (
    <div className="relative">
      <Input
        {...rest}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoCapitalize="off"
        spellCheck={false}
        disabled={disabled}
        className={cn('pr-10', className)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-1/2 right-1 -translate-y-1/2"
        aria-pressed={visible}
        aria-label={label}
        title={label}
        disabled={disabled || revealDisabled}
        onClick={() => setVisible((shown) => !shown)}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  );
}
