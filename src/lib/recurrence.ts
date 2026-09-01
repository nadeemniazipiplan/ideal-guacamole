import type { ISODate, Recurrence, TaskInstance, TaskTemplate } from '../types/models';
import { RECORD_SCHEMA_VERSION } from '../types/models';
import { dayOfWeek, diffDays, nowInstant, toLocalISODate } from './date';

export const RECURRENCE_LABELS: Record<Recurrence['kind'], string> = {
  none: 'One-off',
  daily: 'Every day',
  weekdays: 'Selected weekdays',
  weekly: 'Weekly',
  interval: 'Every N days',
};

export function describeRecurrence(recurrence: Recurrence): string {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  switch (recurrence.kind) {
    case 'none':
      return `One-off on ${recurrence.startDate}`;
    case 'daily':
      return 'Every day';
    case 'weekdays':
    case 'weekly': {
      if (recurrence.daysOfWeek.length === 0) return 'No days selected';
      const sorted = [...recurrence.daysOfWeek].sort((a, b) => a - b);
      return sorted.map((d) => names[d]).join(', ');
    }
    case 'interval':
      return `Every ${Math.max(1, recurrence.intervalDays)} day(s) from ${recurrence.startDate}`;
    default:
      return 'Custom';
  }
}

export function isDueOn(recurrence: Recurrence, date: ISODate): boolean {
  if (date < recurrence.startDate) return false;
  if (recurrence.endDate && date > recurrence.endDate) return false;

  switch (recurrence.kind) {
    case 'none':
      return date === recurrence.startDate;
    case 'daily':
      return true;
    case 'weekdays':
    case 'weekly':
      return recurrence.daysOfWeek.includes(dayOfWeek(date));
    case 'interval': {
      const interval = Math.max(1, Math.round(recurrence.intervalDays));
      return diffDays(recurrence.startDate, date) % interval === 0;
    }
    default:
      return false;
  }
}

/**
 * A template can produce at most one instance per date, so the id is derived
 * from the pair rather than random. Two writes for the same day overwrite each
 * other instead of creating a duplicate, whatever order they arrive in.
 */
export function instanceIdFor(templateId: string, date: ISODate): string {
  return `${templateId}::${date}`;
}

export function instanceFromTemplate(
  template: TaskTemplate,
  date: ISODate,
  tz: string,
  order: number,
): TaskInstance {
  const now = nowInstant();
  return {
    id: instanceIdFor(template.id, date),
    createdAt: now,
    updatedAt: now,
    v: RECORD_SCHEMA_VERSION,
    date,
    tz,
    templateId: template.id,
    title: template.title,
    description: template.description,
    category: template.category,
    dueTime: template.dueTime,
    estimatedMinutes: template.estimatedMinutes,
    priority: template.priority,
    mandatory: template.mandatory,
    notes: template.notes,
    status: 'pending',
    completedAt: null,
    order,
    carriedToDate: null,
    carriedFromId: null,
  };
}

/**
 * Creates the missing dated instances for the given dates.
 *
 * A template never produces instances for dates before the template itself
 * existed, so adding a recurring task today cannot retroactively mark past days
 * as missed. Instances the user has cancelled stay cancelled: they still exist,
 * so they are not regenerated.
 */
export function materialiseInstances(
  templates: TaskTemplate[],
  existing: TaskInstance[],
  dates: ISODate[],
  tz: string,
): TaskInstance[] {
  const seen = new Set<string>();
  for (const instance of existing) {
    if (instance.templateId) seen.add(`${instance.templateId}|${instance.date}`);
  }

  const created: TaskInstance[] = [];
  const orderByDate = new Map<ISODate, number>();
  for (const instance of existing) {
    orderByDate.set(instance.date, Math.max(orderByDate.get(instance.date) ?? 0, instance.order + 1));
  }

  for (const template of templates) {
    if (template.archived) continue;
    const templateDate = toLocalISODate(template.createdAt, template.tz || tz);
    const earliest = template.recurrence.startDate > templateDate ? template.recurrence.startDate : templateDate;

    for (const date of dates) {
      if (date < earliest) continue;
      if (!isDueOn(template.recurrence, date)) continue;
      const key = `${template.id}|${date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const order = orderByDate.get(date) ?? 0;
      orderByDate.set(date, order + 1);
      created.push(instanceFromTemplate(template, date, tz, order));
    }
  }

  return created;
}

/** Fields copied from a template onto its future instances when it is edited. */
export function applyTemplateToInstance(template: TaskTemplate, instance: TaskInstance): TaskInstance {
  return {
    ...instance,
    title: template.title,
    description: template.description,
    category: template.category,
    dueTime: template.dueTime,
    estimatedMinutes: template.estimatedMinutes,
    priority: template.priority,
    mandatory: template.mandatory,
    notes: template.notes,
    updatedAt: nowInstant(),
  };
}
