// src/admin/dev/logs/healthView.js
/**
 * View-model of the Kesehatan Sistem page: overall status line, sections with Indonesian labels and details, check time.
 * Pure — built from the `GET /api/admin/health` report.
 *
 * @module admin/dev/logs/healthView
 */
import { HEALTH_COPY as H } from '../../../copy/id/systemLogs.js';
import { formatAbsolute } from '../lib/timeView.js';
import { translateDetail, translateLabel, translateSection } from './healthText.js';

/**
 * "Semua pengecekan baik" / "2 masalah · 1 peringatan".
 * @param {{sections: {items: {status: string}[]}[]}} report
 */
export function describeOverall(report) {
  const items = report.sections.flatMap((section) => section.items);
  const errors = items.filter((item) => item.status === 'error').length;
  const warnings = items.filter((item) => item.status === 'warn').length;
  if (!errors && !warnings) return H.overall.allOk;
  return [errors ? H.overall.problems(errors) : '', warnings ? H.overall.warnings(warnings) : ''].filter(Boolean).join(' · ');
}

/**
 * @param {{status: string, generatedAt: number, sections: {id: string, title: string, items: {id: string, label: string, status: string, detail: string}[]}[]}} report
 */
export function healthView(report) {
  return {
    status: report.status,
    summary: describeOverall(report),
    checkedAt: H.checkedAt(formatAbsolute(report.generatedAt, { now: report.generatedAt, seconds: false })),
    sections: report.sections.map((section) => ({
      id: section.id,
      title: translateSection(section.id, section.title),
      items: section.items.map((item) => ({ id: item.id, label: translateLabel(item), detail: translateDetail(item.detail), status: item.status })),
    })),
  };
}
