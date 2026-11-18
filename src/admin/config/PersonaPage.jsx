// src/admin/config/PersonaPage.jsx
/**
 * /dev → Persona: the locked core rules (read-only, always in force), the owner's extra Forbidden → Instead rules (which
 * can only add restrictions) and the optional topic restriction. One fixed speaking style; no style picker.
 */
import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { ConfirmDialog } from '@/components/app/ConfirmDialog.jsx';
import { ErrorState } from '@/components/app/ErrorState.jsx';
import { LoadingState } from '@/components/app/LoadingState.jsx';
import { PageHeader } from '@/components/app/PageHeader.jsx';
import { Button } from '@/components/ui/button';
import { PERSONA_COPY as T } from '@/copy/en/configForms';
import { LeaveGuard } from './LeaveGuard.jsx';
import { CoreRulesCard, ExtraRulesCard, TopicsCard } from './PersonaSections.jsx';
import { SaveBar } from './SaveBar.jsx';
import { defaultPersonaForm, extraRuleRows, settingsFromPersonaForm, topicFormFromSettings } from './personaForm.js';
import { useSettingsForm } from './useSettingsForm.js';
import { useVoiceSettingsResource } from './useVoiceSettingsResource.js';

const toForm = (settings) => ({ rows: extraRuleRows(settings), topics: topicFormFromSettings(settings) });
const build = (payload, form) => settingsFromPersonaForm(payload.settings, form.rows, form.topics);

function PersonaForm({ payload, reload }) {
  const state = useSettingsForm({ payload, reload, savedMessage: T.saved, toForm, build });
  const { form, setForm } = state;
  const [confirmReset, setConfirmReset] = useState(false);
  const [focusIndex, setFocusIndex] = useState(null);
  const setRows = (rows, focus = null) => { setFocusIndex(focus); setForm((current) => ({ ...current, rows })); };
  const setTopics = (change) => setForm((current) => ({ ...current, topics: { ...current.topics, ...change } }));

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirmReset(true)}>
          <RotateCcw aria-hidden="true" data-icon="inline-start" />{T.reset.button}
        </Button>
      </div>
      <form noValidate onSubmit={(event) => { event.preventDefault(); void state.save(); }} className="flex flex-col gap-4">
        <CoreRulesCard rules={payload.coreRules} />
        <ExtraRulesCard rows={form.rows} focusIndex={focusIndex} onChange={setRows} />
        <TopicsCard topics={form.topics} onChange={setTopics} />
        <SaveBar dirty={state.dirty} saving={state.saving} savedAt={state.savedAt} messages={state.messages} onDiscard={state.discard} />
      </form>
      <LeaveGuard dirty={state.dirty} />
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={T.reset.title}
        impact={T.reset.impact}
        actionLabel={T.reset.action}
        destructive
        onConfirm={() => setForm(defaultPersonaForm())}
      />
    </>
  );
}

/** Persona page. */
export function PersonaPage() {
  const { data, error, reload } = useVoiceSettingsResource();
  let body;
  if (error && !data) body = <ErrorState title={T.loadError} error={error} onRetry={reload} />;
  else if (!data) body = <LoadingState variant="form" label={T.loading} />;
  else body = <PersonaForm payload={data} reload={reload} />;
  return (
    <div className="flex max-w-3xl flex-col">
      <PageHeader title={T.title} description={T.description} />
      {body}
    </div>
  );
}
