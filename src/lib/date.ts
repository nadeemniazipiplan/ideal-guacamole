/**
 * Time-zone aware calendar-date helpers.
 *
 * Every "day" in this app is a *local calendar date* in the user's selected
 * time zone, represented as a `YYYY-MM-DD` string. Arithmetic is performed on
 * that string via a UTC anchor at 12:00 so daylight-saving shifts can never
 * move a date by a day.
 */
import type { ISODate, WeekStart } from '../types/models';

export const DEFAULT_TZ = 'Asia/Karachi';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const anchor = new Date(Date.UTC(y, m - 1, d, 12));
  return anchor.getUTCFullYear() === y && anchor.getUTCMonth() === m - 1 && anchor.getUTCDate() === d;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function safeTz(tz: string): string {
  return isValidTimeZone(tz) ? tz : DEFAULT_TZ;
}

/** The local calendar date of an instant, in the given time zone. */
export function toLocalISODate(instant: Date | string | number, tz: string): ISODate {
  const date = instant instanceof Date ? instant : new Date(instant);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz(tz),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '01';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function todayISO(tz: string, now: Date = new Date()): ISODate {
  return toLocalISODate(now, tz);
}

/** Local wall-clock time (HH:mm) in the given time zone. */
export function localTime(tz: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: safeTz(tz),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

function anchor(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function fromAnchor(date: Date): ISODate {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso: ISODate, days: number): ISODate {
  const a = anchor(iso);
  a.setUTCDate(a.getUTCDate() + days);
  return fromAnchor(a);
}

export function addMonths(iso: ISODate, months: number): ISODate {
  const a = anchor(iso);
  const day = a.getUTCDate();
  a.setUTCDate(1);
  a.setUTCMonth(a.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 0, 12)).getUTCDate();
  a.setUTCDate(Math.min(day, lastDay));
  return fromAnchor(a);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((anchor(to).getTime() - anchor(from).getTime()) / 86_400_000);
}

/** 0 = Sunday .. 6 = Saturday */
export function dayOfWeek(iso: ISODate): number {
  return anchor(iso).getUTCDay();
}

export function startOfWeek(iso: ISODate, weekStart: WeekStart): ISODate {
  const dow = dayOfWeek(iso);
  const offset = weekStart === 'monday' ? (dow + 6) % 7 : dow;
  return addDays(iso, -offset);
}

export function endOfWeek(iso: ISODate, weekStart: WeekStart): ISODate {
  return addDays(startOfWeek(iso, weekStart), 6);
}

export function startOfMonth(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: ISODate): ISODate {
  const [y, m] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

export function rangeDates(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const total = diffDays(from, to);
  if (total < 0) return out;
  for (let i = 0; i <= total; i += 1) out.push(addDays(from, i));
  return out;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function weekdayName(iso: ISODate, short = false): string {
  const name = WEEKDAY_NAMES[dayOfWeek(iso)];
  return short ? name.slice(0, 3) : name;
}

export function monthName(iso: ISODate, short = false): string {
  const name = MONTH_NAMES[Number(iso.slice(5, 7)) - 1];
  return short ? name.slice(0, 3) : name;
}

/** "Monday, 1 September 2026" */
export function formatLongDate(iso: ISODate): string {
  return `${weekdayName(iso)}, ${Number(iso.slice(8, 10))} ${monthName(iso)} ${iso.slice(0, 4)}`;
}

/** "1 Sep" */
export function formatShortDate(iso: ISODate): string {
  return `${Number(iso.slice(8, 10))} ${monthName(iso, true)}`;
}

/** Weekday headers ordered for the configured week start. */
export function weekdayHeaders(weekStart: WeekStart): { index: number; label: string }[] {
  const order = weekStart === 'monday' ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  return order.map((index) => ({ index, label: WEEKDAY_NAMES[index].slice(0, 3) }));
}

/** A 6x7 grid of dates covering the month that `iso` falls in. */
export function monthGrid(iso: ISODate, weekStart: WeekStart): ISODate[] {
  const first = startOfMonth(iso);
  const gridStart = startOfWeek(first, weekStart);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function minutesFromHHmm(value: string | null): number | null {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function nowInstant(): string {
  return new Date().toISOString();
}

/** Is `time` inside the (possibly midnight-crossing) window [start, end)? */
export function isWithinWindow(time: string, start: string, end: string): boolean {
  const t = minutesFromHHmm(time);
  const s = minutesFromHHmm(start);
  const e = minutesFromHHmm(end);
  if (t === null || s === null || e === null) return false;
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

export const COMMON_TIME_ZONES = [
  'Asia/Karachi', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Riyadh', 'Asia/Singapore',
  'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'Europe/Berlin', 'Europe/Istanbul',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'UTC',
];
