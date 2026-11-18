// src/admin/dev/logs/LogToolbar.jsx
/** Filters of the server log: text search, level, source, and the auto-refresh switch. All keyboard-operable. */
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { LOG_LEVEL_COPY, SERVER_LOG_COPY as T } from '@/copy/en/systemLogs';
import { ALL, sourceLabel } from './serverLogView.js';

const LEVELS = ['error', 'warn', 'info'];

/**
 * @param {{filter: {level: string, source: string, q: string}, sources: string[], onChange: (patch: object) => void,
 *   autoRefresh: boolean, onAutoRefreshChange: (on: boolean) => void}} props
 */
export function LogToolbar({ filter, sources, onChange, autoRefresh, onAutoRefreshChange }) {
  return (
    <>
      <div className="relative w-full sm:w-72">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" aria-label={T.search} placeholder={T.searchPlaceholder} value={filter.q} className="pl-8" onChange={(event) => onChange({ q: event.target.value })} />
      </div>
      <Select value={filter.level} onValueChange={(level) => onChange({ level })}>
        <SelectTrigger aria-label={T.levelLabel} className="w-full sm:w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{T.allLevels}</SelectItem>
          {LEVELS.map((level) => <SelectItem key={level} value={level}>{LOG_LEVEL_COPY[level]}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filter.source} onValueChange={(source) => onChange({ source })}>
        <SelectTrigger aria-label={T.sourceLabel} className="w-full sm:w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{T.allSources}</SelectItem>
          {sources.map((source) => <SelectItem key={source} value={source}>{sourceLabel(source)}</SelectItem>)}
        </SelectContent>
      </Select>
      <label className="flex items-center gap-2 text-sm sm:ml-auto" title={T.autoRefreshHint}>
        <Switch checked={autoRefresh} onCheckedChange={onAutoRefreshChange} />
        {T.autoRefresh}
      </label>
    </>
  );
}
