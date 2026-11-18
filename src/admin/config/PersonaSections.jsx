// src/admin/config/PersonaSections.jsx
/** The three cards of Persona: locked core rules (read-only), the owner's extra rules and the topic restriction. */
import { useEffect, useRef } from 'react';
import { ListPlus, Lock, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/app/EmptyState.jsx';
import { FormField } from '@/components/app/FormField.jsx';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PERSONA_COPY as T } from '@/copy/en/configForms';
import { CharCounter } from './CharCounter.jsx';
import { SettingSwitch } from './SettingSwitch.jsx';
import { SettingsCard } from './GeneralSections.jsx';
import {
  EXTRA_RULES_MAX, EXTRA_RULE_TEXT_MAX, REFUSAL_MAX, TOPICS_MAX, describeRuleGroup, groupCoreRules, guardLabel, summarizeCoreRules,
} from './personaForm.js';

function CoreRule({ rule }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="w-6 shrink-0 pt-0.5 text-sm text-muted-foreground tabular-nums">{rule.id}</span>
      <div className="min-w-0 flex-1 text-sm">
        <p><span className="font-medium">{T.core.forbid}: </span>{rule.forbid}</p>
        <p className="text-muted-foreground"><span className="font-medium text-foreground">{T.core.instead}: </span>{rule.instead}</p>
      </div>
      <Badge variant="outline" className="shrink-0">{guardLabel(rule.guard)}</Badge>
    </li>
  );
}

/** @param {{rules: {groups: object[], rules: object[]}}} props `coreRules` of the settings reply. */
export function CoreRulesCard({ rules }) {
  const groups = groupCoreRules(rules.groups, rules.rules);
  return (
    <SettingsCard title={T.core.title} description={T.core.description}>
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock aria-hidden="true" className="size-4 shrink-0" />{summarizeCoreRules(groups)}</p>
      <div className="flex flex-col gap-2">
        {groups.map((group, index) => (
          <details key={group.id} open={index === 0} className="group rounded-lg border">
            <summary className="flex min-h-9 cursor-pointer flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              {group.label}
              <span className="font-normal text-muted-foreground">{describeRuleGroup(group)}</span>
            </summary>
            <ol className="divide-y border-t px-3">{group.rules.map((rule) => <CoreRule key={rule.id} rule={rule} />)}</ol>
          </details>
        ))}
      </div>
    </SettingsCard>
  );
}

function RuleRow({ row, index, onChange, onRemove, autoFocus }) {
  const first = useRef(null);
  useEffect(() => { if (autoFocus) first.current?.focus(); }, [autoFocus]);
  const E = T.extra;
  const field = (key, label, placeholder, ref) => (
    <div className="flex flex-col gap-1">
      <FormField label={label}>
        <Input ref={ref} value={row[key]} maxLength={EXTRA_RULE_TEXT_MAX} placeholder={placeholder} autoComplete="off" onChange={(e) => onChange({ [key]: e.target.value })} />
      </FormField>
      <CharCounter used={row[key].length} max={EXTRA_RULE_TEXT_MAX} />
    </div>
  );
  return (
    <li>
      <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">{E.ruleLabel(index + 1)}</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {field('forbid', E.forbidLabel, E.forbidPlaceholder, first)}
          {field('instead', E.insteadLabel, E.insteadPlaceholder)}
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label={E.remove(index + 1)}>
            <Trash2 aria-hidden="true" data-icon="inline-start" />{T.extra.removeShort}
          </Button>
        </div>
      </fieldset>
    </li>
  );
}

/** @param {{rows: Array<{forbid: string, instead: string}>, focusIndex: number | null, onChange: (rows: object[], focusIndex?: number | null) => void}} props */
export function ExtraRulesCard({ rows, focusIndex, onChange }) {
  const E = T.extra;
  const add = (
    <Button type="button" variant="outline" disabled={rows.length >= EXTRA_RULES_MAX} onClick={() => onChange([...rows, { forbid: '', instead: '' }], rows.length)}>
      <ListPlus aria-hidden="true" data-icon="inline-start" />{E.add}
    </Button>
  );
  return (
    <SettingsCard title={E.title} description={E.description(EXTRA_RULES_MAX)}>
      <p className="text-sm text-muted-foreground">{E.guidance}</p>
      {rows.length === 0 ? <EmptyState title={E.emptyTitle} description={E.emptyDescription} className="border-dashed" action={add} /> : (
        <>
          <ol className="flex flex-col gap-3">
            {rows.map((row, index) => (
              <RuleRow
                key={row.key ?? index}
                row={row}
                index={index}
                autoFocus={focusIndex === index}
                onChange={(change) => onChange(rows.map((r, i) => (i === index ? { ...r, ...change } : r)), null)}
                onRemove={() => onChange(rows.filter((_, i) => i !== index), null)}
              />
            ))}
          </ol>
          <div>{add}</div>
        </>
      )}
    </SettingsCard>
  );
}

/** @param {{topics: {topicsEnabled: boolean, topics: string, refusal: string}, onChange: (change: object) => void}} props */
export function TopicsCard({ topics, onChange }) {
  const P = T.topics;
  return (
    <SettingsCard title={P.title} description={P.description}>
      <SettingSwitch title={P.enabled} checked={topics.topicsEnabled} onCheckedChange={(topicsEnabled) => onChange({ topicsEnabled })} />
      <FormField label={P.allowed.label} description={P.allowed.description(TOPICS_MAX)}>
        <Textarea value={topics.topics} rows={4} placeholder={P.allowed.placeholder} onChange={(e) => onChange({ topics: e.target.value })} />
      </FormField>
      <div className="flex flex-col gap-1">
        <FormField label={P.refusal.label} description={P.refusal.description(REFUSAL_MAX)}>
          <Input value={topics.refusal} maxLength={REFUSAL_MAX} autoComplete="off" onChange={(e) => onChange({ refusal: e.target.value })} />
        </FormField>
        <CharCounter used={topics.refusal.length} max={REFUSAL_MAX} />
      </div>
    </SettingsCard>
  );
}
