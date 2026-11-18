// src/login/PasswordRequirements.jsx
/** The live checklist under the new-password field: icon + words + a screen-reader state, never colour alone. */
import { Check, Circle } from 'lucide-react';
import { PASSWORD_COPY } from '../copy/en/login.js';

/**
 * @param {{id: string, items: ReturnType<typeof import('./changePasswordView.js').passwordRequirements>}} props
 *   `id` is the element id the password input points to with aria-describedby.
 */
export function PasswordRequirements({ id, items }) {
  return (
    <ul id={id} aria-label={PASSWORD_COPY.requirementsLabel} className="grid gap-1.5">
      {items.map(({ id: key, label, met }) => (
        <li key={key} className={`flex items-center gap-2 text-sm ${met ? 'text-foreground' : 'text-muted-foreground'}`}>
          {met ? <Check aria-hidden="true" className="size-4 shrink-0 text-success" /> : <Circle aria-hidden="true" className="size-4 shrink-0" />}
          <span>{label}<span className="sr-only">: {met ? PASSWORD_COPY.requirementMet : PASSWORD_COPY.requirementUnmet}</span></span>
        </li>
      ))}
    </ul>
  );
}
