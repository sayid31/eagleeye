// src/admin/config/AiUsageSections.jsx
/** Cards of Pemakaian & Biaya: today's spend against the daily cap, the per-day table and the rates behind the estimate. */
import { AudioLines } from 'lucide-react';
import { DataTable } from '@/components/app/DataTable.jsx';
import { EmptyState } from '@/components/app/EmptyState.jsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { USAGE_AI_COPY as T } from '@/copy/en/configForms';
import { UsageMeter } from '../dev/usage/UsageMeter.jsx';
import { formatDuration, formatEstimate, todayView } from './usageView.js';

/** @param {{usage: object}} props GET /api/admin/voice/usage. */
export function TodayCard({ usage }) {
  const view = todayView(usage);
  return (
    <Card>
      <CardHeader><CardTitle role="heading" aria-level={2}>{T.today.title}</CardTitle><CardDescription>{view.line}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-4">
          <div><dt className="text-sm text-muted-foreground">{T.today.cost}</dt><dd className="text-3xl font-semibold tracking-tight tabular-nums">{view.cost}</dd></div>
          <div><dt className="text-sm text-muted-foreground">{T.today.audio}</dt><dd className="text-3xl font-semibold tracking-tight tabular-nums">{view.audio}</dd></div>
        </dl>
        {view.meter ? <UsageMeter meter={view.meter} /> : null}
      </CardContent>
    </Card>
  );
}

const dayColumns = [
  { id: 'day', header: T.daily.columns.day, cell: (row) => row.day },
  { id: 'sessions', header: T.daily.columns.sessions, cell: (row) => row.sessions },
  { id: 'audio', header: T.daily.columns.audio, cell: (row) => formatDuration(row.seconds) },
  { id: 'extras', header: T.daily.columns.extras, cell: (row) => formatEstimate(row.extrasUsd) },
  { id: 'judge', header: T.daily.columns.judge, cell: (row) => row.judgeCalls },
  { id: 'cost', header: T.daily.columns.cost, className: 'text-right tabular-nums', cell: (row) => formatEstimate(row.estimatedUsd) },
];

const dayCard = (row) => (
  <div className="flex flex-wrap items-baseline justify-between gap-2">
    <span className="font-medium">{row.day}</span>
    <span className="font-medium tabular-nums">{formatEstimate(row.estimatedUsd)}</span>
    <span className="w-full text-sm text-muted-foreground">{T.daily.session(row.sessions)} · {formatDuration(row.seconds)} · {T.daily.columns.judge} {row.judgeCalls}</span>
  </div>
);

/** @param {{usage: object, days: number, onDays: (days: number) => void, loading: boolean}} props */
export function DailyCard({ usage, days, onDays, loading }) {
  const { rows, total } = usage.summary;
  const used = rows.filter((row) => row.sessions > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>{T.daily.title}</CardTitle>
        <CardDescription>{T.daily.session(total.sessions)} · {formatDuration(total.seconds)} · {formatEstimate(total.estimatedUsd)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div role="group" aria-label={T.daily.range} className="flex flex-wrap gap-2">
          {usage.dayOptions.map((option) => (
            <Button key={option} type="button" size="sm" variant={option === days ? 'default' : 'outline'} aria-pressed={option === days} onClick={() => onDays(option)}>{T.daily.rangeOption(option)}</Button>
          ))}
        </div>
        <DataTable
          caption={T.daily.caption}
          columns={dayColumns}
          rows={used}
          getRowId={(row) => row.day}
          loading={loading}
          renderCard={dayCard}
          empty={<EmptyState icon={AudioLines} title={T.daily.emptyTitle} description={T.daily.emptyDescription} />}
        />
      </CardContent>
    </Card>
  );
}

/** @param {{rates: object}} props */
export function RatesCard({ rates }) {
  const R = T.rates;
  return (
    <Card>
      <CardHeader><CardTitle role="heading" aria-level={2}>{R.title}</CardTitle><CardDescription>{R.description(rates.verifiedOn)}</CardDescription></CardHeader>
      <CardContent>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>{R.live(rates.liveModel, rates.livePerMin.toFixed(2))}</li>
          <li>{R.reader(rates.readerModel, rates.readerInPerMTok, rates.readerOutPerMTok)}</li>
          <li>{R.judge(rates.judgeModel, rates.judgeInPerMTok, rates.judgeOutPerMTok, rates.judgeEnabled)}</li>
          <li>{R.excluded}</li>
        </ul>
      </CardContent>
    </Card>
  );
}
