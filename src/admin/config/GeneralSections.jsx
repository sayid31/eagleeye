// src/admin/config/GeneralSections.jsx
/** The three cards of Umum: Asisten, Izin tools and Batas sesi. Controlled by GeneralPage's form state. */
import { Info, TriangleAlert } from 'lucide-react';
import { FormField } from '@/components/app/FormField.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { GENERAL_COPY as T } from '@/copy/id/configForms';
import { CharCounter } from './CharCounter.jsx';
import { SettingSwitch } from './SettingSwitch.jsx';
import { LIMIT_FIELDS, PERSONA_INSTRUCTIONS_MAX, PERSONA_NAME_MAX, describeToolGroup, hardCapNote, sessionCapWarning } from './generalForm.js';

/** Card with a title and one-line description, the grouping unit of every settings form. */
export function SettingsCard({ title, description, actions, children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {actions ? <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">{actions}</div> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">{children}</CardContent>
    </Card>
  );
}

/** @param {{form: object, patch: (change: object) => void, onToggleVoice: (on: boolean) => void}} props */
export function AssistantCard({ form, patch, onToggleVoice }) {
  const A = T.assistant;
  return (
    <SettingsCard title={A.title} description={A.description}>
      <SettingSwitch title={A.enabled.title} description={A.enabled.description} checked={form.enabled} onCheckedChange={onToggleVoice} />
      <FormField label={A.name.label} description={A.name.description(PERSONA_NAME_MAX)}>
        <Input value={form.name} maxLength={PERSONA_NAME_MAX} autoComplete="off" onChange={(e) => patch({ name: e.target.value })} />
      </FormField>
      <div className="flex flex-col gap-1">
        <FormField label={A.notes.label} description={A.notes.description}>
          <Textarea value={form.instructions} rows={4} maxLength={PERSONA_INSTRUCTIONS_MAX} placeholder={A.notes.placeholder} onChange={(e) => patch({ instructions: e.target.value })} />
        </FormField>
        <CharCounter used={form.instructions.length} max={PERSONA_INSTRUCTIONS_MAX} />
      </div>
    </SettingsCard>
  );
}

/** @param {{groups: Array<object>, form: object, onToggle: (id: string, on: boolean) => void}} props */
export function ToolsCard({ groups, form, onToggle }) {
  return (
    <SettingsCard title={T.tools.title} description={T.tools.description}>
      {groups.map((group) => {
        const text = describeToolGroup(group);
        return <SettingSwitch key={group.id} title={text.title} description={text.description} checked={form.toolGroups[group.id] !== false} onCheckedChange={(on) => onToggle(group.id, on)} />;
      })}
    </SettingsCard>
  );
}

/** @param {{form: object, ranges: object, errors: Record<string, string>, onChange: (key: string, text: string) => void, onReset: () => void}} props */
export function LimitsCard({ form, ranges, errors, onChange, onReset }) {
  const capWarning = sessionCapWarning(form.limits.sessionMinutes);
  return (
    <SettingsCard
      title={T.limits.title}
      description={T.limits.description}
      actions={<Button type="button" variant="outline" size="sm" onClick={onReset}>{T.limits.reset}</Button>}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {LIMIT_FIELDS.map(({ key, label, unit }) => (
          <FormField key={key} label={label} description={T.limits.range(ranges[key].min, ranges[key].max, unit)} error={errors[key]}>
            <Input value={form.limits[key]} inputMode="numeric" autoComplete="off" placeholder={T.limits.placeholder} onChange={(e) => onChange(key, e.target.value)} />
          </FormField>
        ))}
      </div>
      <Alert variant={capWarning ? 'destructive' : 'default'}>
        {capWarning ? <TriangleAlert aria-hidden="true" /> : <Info aria-hidden="true" />}
        <AlertDescription>{capWarning ?? hardCapNote()}</AlertDescription>
      </Alert>
    </SettingsCard>
  );
}
