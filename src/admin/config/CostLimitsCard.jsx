// src/admin/config/CostLimitsCard.jsx
/** "Batas biaya per sesi": warning and hard cap in USD (empty = default, "off" = none). A small form with its own save. */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/app/FormField.jsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { USAGE_AI_COPY as T } from '@/copy/en/configForms';
import { saveVoiceSettings } from '../api/adminVoiceApi.js';
import { isDirty } from './dirtyState.js';
import { failureMessage } from './failureMessage.js';
import { LeaveGuard } from './LeaveGuard.jsx';
import { costFormFromSettings, effectiveLimitsLine, formatEstimate, settingsFromCostForm } from './usageView.js';

/** @param {{usage: object, settings: object, onSaved: () => void}} props `settings` = the stored voice settings; saving rewrites only `costLimits`. */
export function CostLimitsCard({ usage, settings, onSaved }) {
  const saved = costFormFromSettings(settings.costLimits);
  const [form, setForm] = useState(saved);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm(costFormFromSettings(settings.costLimits)); }, [settings]);
  const dirty = isDirty(form, saved);
  const { defaults } = usage.costLimits;

  const submit = async (event) => {
    event.preventDefault();
    const built = settingsFromCostForm(settings, form);
    setErrors(built.ok ? {} : built.errors);
    setFailure('');
    if (!built.ok) return;
    setSaving(true);
    try {
      await saveVoiceSettings(built.settings);
      toast.success(T.limits.saved);
      onSaved();
    } catch (problem) {
      setFailure(failureMessage(problem));
    } finally {
      setSaving(false);
    }
  };
  const field = (key, copy) => (
    <FormField label={copy.label} error={errors[key]}>
      <Input value={form[key]} inputMode="decimal" autoComplete="off" placeholder={copy.placeholder} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))} />
    </FormField>
  );
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>{T.limits.title}</CardTitle>
          <CardDescription>{T.limits.description(formatEstimate(defaults.warnUsd), formatEstimate(defaults.capUsd))}</CardDescription>
        </CardHeader>
        <CardContent>
          <form noValidate onSubmit={submit} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{effectiveLimitsLine(usage)}</p>
            <div className="grid gap-4 sm:grid-cols-2">{field('warn', T.limits.warn)}{field('cap', T.limits.cap)}</div>
            {failure ? <p role="alert" className="text-sm text-destructive">{failure}</p> : null}
            <div>
              <Button type="submit" disabled={!dirty || saving}>
                {saving ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}{T.limits.save}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <LeaveGuard dirty={dirty} />
    </>
  );
}
