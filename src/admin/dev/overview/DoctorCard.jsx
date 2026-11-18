// src/admin/dev/overview/DoctorCard.jsx
/** The doctor's login-readiness warnings as plain-language alerts; the terminal command stays as a hint. */
import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { OVERVIEW_COPY as T } from '@/copy/id/system';
import { HealthBadge } from '../lib/HealthBadge.jsx';
import { doctorItems } from './overviewView.js';

/** @param {{checks: {id: string, level: string, params?: object}[]}} props `summary.doctor` */
export function DoctorCard({ checks }) {
  const items = doctorItems(checks);
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>{T.doctor.title}</CardTitle>
        <CardDescription>{T.doctor.description}</CardDescription>
        <CardAction>
          {items.length ? <HealthBadge status={items.some((item) => item.level === 'error') ? 'error' : 'warn'} label={T.doctor.count(items.length)} /> : <HealthBadge status="ok" />}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {items.length === 0 ? (
          <p className="flex items-center gap-2 text-sm"><CircleCheck aria-hidden="true" className="size-4 shrink-0 text-success" />{T.doctor.none}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const Icon = item.level === 'error' ? CircleAlert : TriangleAlert;
              return (
                <li key={item.id}>
                  <Alert role="group" variant={item.level === 'error' ? 'destructive' : 'default'} className={item.level === 'error' ? undefined : '*:[svg]:text-warning'}>
                    <Icon aria-hidden="true" />
                    <AlertTitle>{item.title}</AlertTitle>
                    <AlertDescription>{item.text}</AlertDescription>
                  </Alert>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-sm text-muted-foreground">{T.doctor.hint}</p>
      </CardContent>
    </Card>
  );
}
