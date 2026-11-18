// src/admin/config/useSettingsForm.js
/**
 * State of one voice-settings form (Umum, Persona, Penyedia AI): the editable copy of the saved settings, whether it
 * differs from them, validation, the save call and its outcome. A successful save reloads the settings, which resets
 * the form to what the server now holds.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SAVE_COPY } from '../../copy/en/config.js';
import { saveVoiceSettings } from '../api/adminVoiceApi.js';
import { formatAbsolute } from '../dev/lib/timeView.js';
import { isDirty } from './dirtyState.js';
import { failureMessage } from './failureMessage.js';

/** Clock time of a save ("14.02"). */
const clock = () => formatAbsolute(Date.now(), { seconds: false }).split(' ').pop();

/**
 * @param {{
 *   payload: object, reload: () => void, savedMessage: string,
 *   toForm: (settings: object, payload: object) => any,
 *   build: (payload: object, form: any) => {ok: true, settings: object} | {ok: false, errors: Record<string, string> | string[]},
 * }} options `payload` is the loaded GET /api/admin/voice/settings reply; `build` validates and returns the full settings to PUT.
 */
export function useSettingsForm({ payload, reload, savedMessage, toForm, build }) {
  const saved = useMemo(() => toForm(payload.settings, payload), [payload, toForm]);
  const [form, setForm] = useState(saved);
  const [problem, setProblem] = useState({ fields: {}, messages: [] });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  useEffect(() => { setForm(saved); }, [saved]);

  const dirty = isDirty(form, saved);
  const patch = useCallback((change) => { setForm((current) => ({ ...current, ...change })); setProblem({ fields: {}, messages: [] }); }, []);
  const discard = useCallback(() => { setForm(saved); setProblem({ fields: {}, messages: [] }); toast(SAVE_COPY.discarded); }, [saved]);

  const save = useCallback(async () => {
    const built = build(payload, form);
    if (!built.ok) {
      const list = Array.isArray(built.errors);
      setProblem({ fields: list ? {} : built.errors, messages: list ? built.errors : [] });
      return false;
    }
    setSaving(true);
    setProblem({ fields: {}, messages: [] });
    try {
      await saveVoiceSettings(built.settings);
      setSavedAt(clock());
      toast.success(savedMessage);
      reload();
      return true;
    } catch (failure) {
      setProblem({ fields: {}, messages: [failureMessage(failure)] });
      return false;
    } finally {
      setSaving(false);
    }
  }, [build, form, payload, reload, savedMessage]);

  return { form, setForm, patch, dirty, saving, savedAt, fieldErrors: problem.fields, messages: problem.messages, save, discard };
}
