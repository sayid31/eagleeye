// src/admin/config/GeneralPage.jsx
/**
 * /dev → Umum: voice on/off, assistant name and personality notes, the tool permission groups and the session limits
 * (the topic restriction lives on Persona). Reads and writes the voice-settings store through /api/admin/voice/settings.
 */
import { useState } from 'react';
import { CapabilityChip } from '@/components/app/StatusBadge.jsx';
import { ConfirmDialog } from '@/components/app/ConfirmDialog.jsx';
import { ErrorState } from '@/components/app/ErrorState.jsx';
import { LoadingState } from '@/components/app/LoadingState.jsx';
import { PageHeader } from '@/components/app/PageHeader.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { GENERAL_COPY as T } from '@/copy/id/configForms';
import { AssistantCard, LimitsCard, ToolsCard } from './GeneralSections.jsx';
import { LeaveGuard } from './LeaveGuard.jsx';
import { SaveBar } from './SaveBar.jsx';
import { enforcedChips, generalFormFromSettings, settingsFromGeneralForm, withDefaultLimits } from './generalForm.js';
import { useSettingsForm } from './useSettingsForm.js';
import { useVoiceSettingsResource } from './useVoiceSettingsResource.js';

const build = (payload, form) => settingsFromGeneralForm(payload.settings, form, payload.limitRanges);
const toForm = (settings) => generalFormFromSettings(settings);

function GeneralForm({ payload, reload }) {
  const state = useSettingsForm({ payload, reload, savedMessage: T.saved, toForm, build });
  const { form, setForm, patch } = state;
  const [confirm, setConfirm] = useState(null);
  // Turning the voice off for everyone is confirmed when it is saved, not when the switch moves (it is only a draft until then).
  const turningOff = payload.settings.enabled !== false && !form.enabled;
  const submit = (event) => {
    event.preventDefault();
    if (turningOff) setConfirm('disable');
    else void state.save();
  };
  const setLimit = (key, text) => setForm((current) => ({ ...current, limits: { ...current.limits, [key]: text } }));
  const setGroup = (id, on) => setForm((current) => ({ ...current, toolGroups: { ...current.toolGroups, [id]: on } }));
  const messages = [...state.messages, ...(Object.keys(state.fieldErrors).length ? [T.limits.invalidSummary] : [])];

  // The dialogs sit beside the form, not inside it: React bubbles a portal's submit event to the form that renders it.
  return (
    <>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={T.enforced.title}>
          <span className="text-sm text-muted-foreground">{T.enforced.title}:</span>
          {enforcedChips(payload.settings, payload.toolGroups).map((chip) => <CapabilityChip key={chip.name} name={chip.name} enabled={chip.enabled} />)}
        </div>
        {payload.storedValid ? null : <Alert variant="destructive"><AlertDescription>{T.storedInvalid}</AlertDescription></Alert>}
        <AssistantCard form={form} patch={patch} onToggleVoice={(enabled) => patch({ enabled })} />
        <ToolsCard groups={payload.toolGroups} form={form} onToggle={setGroup} />
        <LimitsCard form={form} ranges={payload.limitRanges} errors={state.fieldErrors} onChange={setLimit} onReset={() => setConfirm('limits')} />
        <SaveBar dirty={state.dirty} saving={state.saving} savedAt={state.savedAt} messages={messages} onDiscard={state.discard} />
      </form>
      <LeaveGuard dirty={state.dirty} />
      <ConfirmDialog
        open={confirm === 'disable'}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        title={T.disableVoice.title}
        impact={T.disableVoice.impact}
        actionLabel={T.disableVoice.action}
        destructive
        onConfirm={async () => { await state.save(); }}
      />
      <ConfirmDialog
        open={confirm === 'limits'}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        title={T.resetLimits.title}
        impact={T.resetLimits.impact}
        actionLabel={T.resetLimits.action}
        onConfirm={() => setForm(withDefaultLimits)}
      />
    </>
  );
}

/** Umum page. */
export function GeneralPage() {
  const { data, error, reload } = useVoiceSettingsResource();
  let body;
  if (error && !data) body = <ErrorState title={T.loadError} error={error} onRetry={reload} />;
  else if (!data) body = <LoadingState variant="form" label={T.loading} />;
  else body = <GeneralForm payload={data} reload={reload} />;
  return (
    <div className="flex max-w-3xl flex-col">
      <PageHeader title={T.title} description={T.description} />
      {body}
    </div>
  );
}
