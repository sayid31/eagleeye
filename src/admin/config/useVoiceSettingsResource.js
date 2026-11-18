// src/admin/config/useVoiceSettingsResource.js
/** Loads GET /api/admin/voice/settings (the document behind Umum, Persona and Penyedia AI) once and on `reload`. */
import { fetchVoiceSettings } from '../api/adminVoiceApi.js';
import { useResource } from '../users/useResource.js';

const load = () => fetchVoiceSettings();

/** @returns {{data: object | null, loading: boolean, error: unknown, reload: () => void}} */
export const useVoiceSettingsResource = () => useResource(load, 'voice-settings');
