// src/admin/config/AiProviderPage.jsx
/**
 * /dev → Konfigurasi AI → Penyedia AI: the GPT-Live voice and the delegation backend model, plus the state of the
 * OpenAI key (managed on the API Keys page). The provider stays OpenAI. Empty choice = the .env value or built-in default.
 */
import { Link } from 'react-router';
import { KeyRound } from 'lucide-react';
import { ErrorState } from '@/components/app/ErrorState.jsx';
import { FormField } from '@/components/app/FormField.jsx';
import { LoadingState } from '@/components/app/LoadingState.jsx';
import { PageHeader } from '@/components/app/PageHeader.jsx';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AI_PROVIDER_COPY as T, PROVIDERS_COPY } from '@/copy/en/config';
import { SettingsCard } from './GeneralSections.jsx';
import { LeaveGuard } from './LeaveGuard.jsx';
import { KeyStatusBadge } from './ProviderCells.jsx';
import { SaveBar } from './SaveBar.jsx';
import { providerRows } from './providerKeysView.js';
import { describeSource, providerFormFromSettings, settingsFromProviderForm } from './providerForm.js';
import { useProviderKeys } from './useProviderKeys.js';
import { useSettingsForm } from './useSettingsForm.js';
import { useVoiceSettingsResource } from './useVoiceSettingsResource.js';

/** Radix Select forbids an empty item value, so "not chosen" travels as this sentinel. */
const DEFAULT_VALUE = 'default';
const toForm = (settings) => providerFormFromSettings(settings);
const build = (payload, form) => settingsFromProviderForm(payload.settings, form, payload.provider);

function ChoiceSelect({ label, description, error, value, options, onChange }) {
  return (
    <FormField label={label} description={description} error={error}>
      {(control) => (
        <Select value={value || DEFAULT_VALUE} onValueChange={(next) => onChange(next === DEFAULT_VALUE ? '' : next)}>
          <SelectTrigger {...control} className="w-full sm:max-w-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_VALUE}>{T.model.defaultChoice}</SelectItem>
            {options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

function OpenAiKeyCard({ keys }) {
  const row = keys.payload ? providerRows(keys.payload, keys.tests).find((r) => r.id === 'openai') : null;
  if (!row) return null;
  return (
    <SettingsCard title={T.keyCard.title} description={T.keyCard.description}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <KeyStatusBadge status={row.status} />
          <span className="text-sm text-muted-foreground">{PROVIDERS_COPY.columns.source}: {row.source.label}</span>
        </div>
        <Button asChild variant="outline" size="sm"><Link to="/api-keys"><KeyRound aria-hidden="true" data-icon="inline-start" />{T.keyCard.manage}</Link></Button>
      </div>
      {row.key.set ? null : <p className="text-sm text-muted-foreground">{T.keyCard.missing}</p>}
    </SettingsCard>
  );
}

function ModelForm({ payload, reload }) {
  const state = useSettingsForm({ payload, reload, savedMessage: T.saved, toForm, build });
  const { effective, voices, backendModels } = payload.provider;
  const E = T.model;
  return (
    <>
      <form noValidate onSubmit={(event) => { event.preventDefault(); void state.save(); }} className="flex flex-col gap-4">
        <SettingsCard title={E.title} description={E.description(effective.model.value, describeSource(effective.model.source))}>
          <ChoiceSelect label={E.voice.label} description={E.voice.description(effective.voice.value, describeSource(effective.voice.source))}
            error={state.fieldErrors.voice} value={state.form.voice} options={voices} onChange={(voice) => state.patch({ voice })} />
          <ChoiceSelect label={E.backend.label} description={E.backend.description(effective.backendModel.value, describeSource(effective.backendModel.source))}
            error={state.fieldErrors.backendModel} value={state.form.backendModel} options={backendModels} onChange={(backendModel) => state.patch({ backendModel })} />
        </SettingsCard>
        <SaveBar dirty={state.dirty} saving={state.saving} savedAt={state.savedAt} messages={state.messages} onDiscard={state.discard} />
      </form>
      <LeaveGuard dirty={state.dirty} />
    </>
  );
}

/** Penyedia AI page. */
export function AiProviderPage() {
  const { data, error, reload } = useVoiceSettingsResource();
  const keys = useProviderKeys();
  let body;
  if (error && !data) body = <ErrorState title={T.loadError} error={error} onRetry={reload} />;
  else if (!data) body = <LoadingState variant="form" label={T.loading} />;
  else body = <ModelForm payload={data} reload={reload} />;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={PROVIDERS_COPY.aiTitle} description={PROVIDERS_COPY.aiDescription} />
      <OpenAiKeyCard keys={keys} />
      {body}
    </div>
  );
}
