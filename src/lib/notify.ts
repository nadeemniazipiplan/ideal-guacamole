import type { ReminderSettings } from '../types/models';
import { isWithinWindow, localTime } from './date';

export type NotificationSupport = 'unsupported' | 'default' | 'granted' | 'denied';

export function notificationSupport(): NotificationSupport {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationSupport;
}

/**
 * Only ever called from a click. The app never asks twice on its own: once
 * `permissionAsked` is stored, the request is not repeated unless the user
 * presses the button again themselves.
 */
export async function requestNotificationPermission(): Promise<NotificationSupport> {
  if (notificationSupport() === 'unsupported') return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result as NotificationSupport;
  } catch {
    return 'denied';
  }
}

export function isQuietHours(reminders: ReminderSettings, timeZone: string, now: Date = new Date()): boolean {
  return isWithinWindow(localTime(timeZone, now), reminders.quietHoursStart, reminders.quietHoursEnd);
}

export interface ReminderCandidate {
  key: keyof ReminderSettings['modules'];
  text: string;
}

/** Sends a system notification when it is available and permitted; otherwise reports false. */
export function sendSystemNotification(title: string, body: string): boolean {
  if (notificationSupport() !== 'granted') return false;
  try {
    // eslint-disable-next-line no-new
    new Notification(title, { body, tag: 'life-dashboard-reminder', silent: false });
    return true;
  } catch {
    return false;
  }
}

const LAST_SENT_KEY = 'life-dashboard/reminder-last-sent';

/** Per-module throttle. Stored per browser profile; it is a UI convenience, not data. */
export function lastSentAt(moduleKey: string): number {
  try {
    const raw = window.localStorage.getItem(LAST_SENT_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as Record<string, number>;
    return typeof parsed[moduleKey] === 'number' ? parsed[moduleKey] : 0;
  } catch {
    return 0;
  }
}

export function markSent(moduleKey: string): void {
  try {
    const raw = window.localStorage.getItem(LAST_SENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    parsed[moduleKey] = Date.now();
    window.localStorage.setItem(LAST_SENT_KEY, JSON.stringify(parsed));
  } catch {
    // Storage can be unavailable; reminders simply repeat at the normal cadence.
  }
}
