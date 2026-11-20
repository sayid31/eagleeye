// src/admin/config/AiProviderPage.jsx
/**
 * /dev → AI Configuration → AI Provider: the OpenAI key (managed here, not on API Keys) and the GPT-Live voice and
 * delegation backend model. The provider stays OpenAI. The selects show the value in use; picking the default item
 * stores no override (the .env value or built-in default decides).
 */
import { ErrorState } from '@/components/app/ErrorState.jsx';
import { LoadingState } from '@/components/app/LoadingState.jsx';
import { PageHeader } from '@/components/app/PageHeader.jsx';
import { AI_PROVIDER_COPY as T, PROVIDERS_COPY } from '@/copy/en/config';
import { SettingsCard } from './GeneralSections.jsx';
import { LeaveGuard } from './LeaveGuard.jsx';
import { OpenAiKeyCard } from './OpenAiKeyCard.jsx';
import { ProviderChoiceSelect } from './ProviderChoiceSelect.jsx';
import { SaveBar } from './SaveBar.jsx';
import { describeSource, providerFormFromSettings, settingsFromProviderForm } from './providerForm.js';
import { useProviderKeys } from './useProviderKeys.js';
import { useSettingsForm } from './useSettingsForm.js';
import { useVoiceSettingsResource } from './useVoiceSettingsResource.js';

const toForm = (settings) => providerFormFromSettings(settings);
const build = (payload, form) => settingsFromProviderForm(payload.settings, form, payload.provider);

function ModelForm({ payload, reload }) {
  const state = useSettingsForm({ payload, reload, savedMessage: T.saved, toForm, build });
  const { effective, voices, backendModels } = payload.provider;
  const E = T.model;
  return (
    <>
      <form noValidate onSubmit={(event) => { event.preventDefault(); void state.save(); }} className="flex flex-col gap-4">
        <SettingsCard title={E.title} description={E.description(effective.model.value, describeSource(effective.model.source))}>
          <ProviderChoiceSelect label={E.voice.label} description={E.voice.description(effective.voice.value, describeSource(effective.voice.source))}
            error={state.fieldErrors.voice} selected={state.form.voice} saved={payload.settings.provider?.voice ?? ''} effective={effective.voice}
            options={voices} onChange={(voice) => state.patch({ voice })} />
          <ProviderChoiceSelect label={E.backend.label} description={E.backend.description(effective.backendModel.value, describeSource(effective.backendModel.source))}
            error={state.fieldErrors.backendModel} selected={state.form.backendModel} saved={payload.settings.provider?.backendModel ?? ''} effective={effective.backendModel}
            options={backendModels} onChange={(backendModel) => state.patch({ backendModel })} />
        </SettingsCard>
        <SaveBar dirty={state.dirty} saving={state.saving} savedAt={state.savedAt} messages={state.messages} onDiscard={state.discard} />
      </form>
      <LeaveGuard dirty={state.dirty} />
    </>
  );
}

/** AI Provider page. */
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
