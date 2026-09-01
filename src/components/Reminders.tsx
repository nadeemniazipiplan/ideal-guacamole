import { useEffect } from 'react';
import { useApp } from '../state/AppStore';
import { isQuietHours, lastSentAt, markSent, sendSystemNotification } from '../lib/notify';

/**
 * In-app reminders for targets that are still short today.
 *
 * - never asks for notification permission by itself (Settings has the button)
 * - respects quiet hours and the per-module frequency
 * - falls back to an in-app message wherever system notifications are
 *   unavailable or not granted
 */
export function Reminders(): null {
  const { settings, summaryFor, today, notify, ready } = useApp();

  useEffect(() => {
    if (!ready || !settings.reminders.enabled) return undefined;

    const check = () => {
      if (isQuietHours(settings.reminders, settings.timeZone)) return;
      const summary = summaryFor(today);
      const throttleMs = Math.max(15, settings.reminders.frequencyMinutes) * 60_000;

      const candidates: { key: string; enabled: boolean; due: boolean; text: string }[] = [
        {
          key: 'tasks',
          enabled: settings.reminders.modules.tasks,
          due: summary.tasks.mandatory.eligible > 0 && summary.tasks.mandatory.percent < 100,
          text: `${summary.tasks.mandatory.eligible - summary.tasks.mandatory.completed} mandatory task(s) still open today.`,
        },
        {
          key: 'nutrition',
          enabled: settings.reminders.modules.nutrition,
          due: summary.nutrition.calories === 0,
          text: 'No food logged yet today.',
        },
        {
          key: 'steps',
          enabled: settings.reminders.modules.steps,
          due: summary.targets.steps > 0 && summary.stepCount < summary.targets.steps,
          text: `${(summary.targets.steps - summary.stepCount).toLocaleString()} steps to go today.`,
        },
        {
          key: 'fitness',
          enabled: settings.reminders.modules.fitness,
          due: summary.gym.length === 0 && summary.runs.length === 0,
          text: 'No workout or run logged today.',
        },
        {
          key: 'study',
          enabled: settings.reminders.modules.study,
          due: summary.targets.studyMinutes > 0 && summary.studyTotals.minutes < summary.targets.studyMinutes,
          text: `${summary.targets.studyMinutes - summary.studyTotals.minutes} study minutes left today.`,
        },
      ];

      for (const candidate of candidates) {
        if (!candidate.enabled || !candidate.due) continue;
        if (Date.now() - lastSentAt(candidate.key) < throttleMs) continue;
        markSent(candidate.key);
        const sent = settings.reminders.useSystemNotifications && sendSystemNotification('Life Dashboard', candidate.text);
        if (!sent) notify(candidate.text, 'info');
        // One reminder per pass keeps things calm.
        break;
      }
    };

    const id = window.setInterval(check, 5 * 60_000);
    const first = window.setTimeout(check, 20_000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(first);
    };
  }, [ready, settings, summaryFor, today, notify]);

  return null;
}
