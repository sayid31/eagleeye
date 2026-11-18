/** Form pieces shared by the create, edit and reset-password dialogs: capability switches and the password choice. */
import { useId } from 'react';
import { Check, Circle } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FormField } from '@/components/app/FormField.jsx';
import { PasswordInput } from '@/components/app/PasswordInput.jsx';
import { CAPABILITY_KEYS } from '../../auth/authCapabilities.mjs';
import { USERS_COPY } from '../../copy/id/users.js';
import { passwordRequirements } from './userFormView.js';

/** One capability switch with its one-line cost / impact description. */
function CapabilitySwitch({ capability, checked, onChange, disabled }) {
  const id = useId();
  const copy = USERS_COPY.capabilities[capability];
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid min-w-0 gap-0.5">
        <Label htmlFor={id}>{copy.title}</Label>
        <p id={`${id}-description`} className="text-sm text-muted-foreground">{copy.description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} aria-describedby={`${id}-description`} />
    </div>
  );
}

/**
 * The three feature switches (Layer data, Voice & AI, Peta premium & search).
 * @param {{value: Record<string, boolean>, onChange: (next: Record<string, boolean>) => void, disabled?: boolean}} props
 */
export function CapabilitySwitches({ value, onChange, disabled = false }) {
  return (
    <fieldset className="grid gap-3 rounded-lg border p-3" disabled={disabled}>
      <legend className="px-1 text-sm font-medium">{USERS_COPY.capabilitiesLegend}</legend>
      {CAPABILITY_KEYS.map((key) => (
        <CapabilitySwitch key={key} capability={key} checked={Boolean(value[key])} disabled={disabled} onChange={(checked) => onChange({ ...value, [key]: checked })} />
      ))}
    </fieldset>
  );
}

/** Live checklist of the typed-password rules; each line says met / not met in words too. */
function Requirements({ id, items }) {
  const copy = USERS_COPY.password;
  return (
    <ul id={id} aria-label={copy.requirementsTitle} className="grid gap-1 text-sm">
      {items.map((item) => (
        <li key={item.id} className={`flex items-center gap-2 ${item.met ? 'text-success' : 'text-muted-foreground'}`}>
          {item.met ? <Check aria-hidden="true" className="size-4" /> : <Circle aria-hidden="true" className="size-4" />}
          {item.label}
          <span className="sr-only">: {item.met ? copy.met : copy.unmet}</span>
        </li>
      ))}
    </ul>
  );
}

function ModeOption({ value, title, description }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <RadioGroupItem value={value} id={id} aria-describedby={`${id}-description`} className="mt-0.5" />
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{title}</Label>
        <p id={`${id}-description`} className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

/**
 * "Buat otomatis | Ketik sendiri" radio group; the typed case shows a password field with the live rules.
 * @param {{mode: 'generate' | 'typed', password: string, role: string, email?: string, name?: string, error?: string | null,
 *   onMode: (mode: string) => void, onPassword: (value: string) => void}} props
 */
export function PasswordChoice({ mode, password, role, email, name, error, onMode, onPassword }) {
  const rulesId = useId();
  const copy = USERS_COPY.password;
  return (
    <div className="grid gap-3">
      <RadioGroup value={mode} onValueChange={onMode} aria-label={USERS_COPY.form.passwordMode} className="gap-3">
        <ModeOption value="generate" title={copy.generate} description={copy.generateHint} />
        <ModeOption value="typed" title={copy.typed} description={copy.typedHint} />
      </RadioGroup>
      {mode === 'typed' ? (
        <div className="grid gap-2">
          <FormField label={USERS_COPY.form.password} error={error} required>
            {(control) => (
              <PasswordInput
                {...control}
                aria-describedby={[control['aria-describedby'], rulesId].filter(Boolean).join(' ')}
                value={password}
                onChange={(event) => onPassword(event.target.value)}
                autoComplete="new-password"
              />
            )}
          </FormField>
          <Requirements id={rulesId} items={passwordRequirements({ password, role, email, name })} />
        </div>
      ) : null}
    </div>
  );
}
