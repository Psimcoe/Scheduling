/**
 * Date/time formatting utilities for the grid and Gantt.
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

/** Short date: "Jan 6 '25" */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return dayjs.utc(iso).format("MMM D 'YY");
}

/** Medium date: "Mon 1/6/25" */
export function mediumDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return dayjs.utc(iso).format('ddd M/D/YY');
}

/** Full date for editing: "2025-01-06" */
export function isoDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return dayjs.utc(iso).format('YYYY-MM-DD');
}

/** Duration in working days (480 min/day) */
export function durationDays(minutes: number): string {
  const days = minutes / 480;
  if (days === Math.floor(days)) return `${days}d`;
  return `${days.toFixed(1)}d`;
}

/** Parse "5d" or "40h" or "2400m" back to minutes */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(d|h|m|w)?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const unit = match[2] ?? 'd';
  switch (unit) {
    case 'w': return num * 5 * 480;
    case 'd': return num * 480;
    case 'h': return num * 60;
    case 'm': return num;
    default: return null;
  }
}

/** Dependency type code to label */
export function depTypeLabel(type: string | number): string {
  switch (String(type)) {
    case 'FF': case '0': return 'FF';
    case 'FS': case '1': return 'FS';
    case 'SF': case '2': return 'SF';
    case 'SS': case '3': return 'SS';
    default: return '??';
  }
}

/** Constraint type to label */
export function constraintLabel(type: number): string {
  const labels = [
    'ASAP',
    'ALAP',
    'FNET',
    'FNLT',
    'MFO',
    'MSO',
    'SNET',
    'SNLT',
  ];
  return labels[type] ?? `Constraint(${type})`;
}

/** Percentage display */
export function pctLabel(pct: number): string {
  return `${Math.round(pct)}%`;
}

/** Currency display */
export function currency(value: number | null | undefined): string {
  if (value == null) return '';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
