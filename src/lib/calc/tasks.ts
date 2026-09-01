import type { ISODate, TaskInstance } from '../../types/models';
import { round } from '../validate';

export interface TaskStats {
  scheduled: number;
  eligible: number;
  completed: number;
  missed: number;
  skipped: number;
  excused: number;
  pending: number;
  cancelled: number;
  percent: number;
}

export interface TaskDayStats {
  all: TaskStats;
  mandatory: TaskStats;
}

/**
 * Eligibility rules:
 *  - cancelled (and deleted, which simply no longer exist) tasks are excluded
 *  - excused tasks are excluded from the denominator but stay visible in history
 *  - skipped tasks count as missed
 */
export function isEligible(task: TaskInstance): boolean {
  return task.status !== 'cancelled' && task.status !== 'excused';
}

export function computeTaskStats(tasks: TaskInstance[], reference: ISODate | null = null, now: ISODate | null = null): TaskStats {
  const scheduled = tasks.length;
  const cancelled = tasks.filter((t) => t.status === 'cancelled').length;
  const excused = tasks.filter((t) => t.status === 'excused').length;
  const eligibleTasks = tasks.filter(isEligible);
  const completed = eligibleTasks.filter((t) => t.status === 'completed').length;
  const skipped = eligibleTasks.filter((t) => t.status === 'skipped').length;
  const pending = eligibleTasks.filter((t) => t.status === 'pending').length;

  // A pending task only counts as "missed" once its day is in the past.
  const dayIsPast = reference !== null && now !== null ? reference < now : false;
  const missed = skipped + (dayIsPast ? pending : 0);

  const eligible = eligibleTasks.length;
  const percent = eligible === 0 ? 0 : round((completed / eligible) * 100, 1);

  return { scheduled, eligible, completed, missed, skipped, excused, pending, cancelled, percent };
}

export function computeTaskDayStats(
  tasks: TaskInstance[],
  date: ISODate | null = null,
  today: ISODate | null = null,
): TaskDayStats {
  return {
    all: computeTaskStats(tasks, date, today),
    mandatory: computeTaskStats(tasks.filter((t) => t.mandatory), date, today),
  };
}

/** True when every eligible mandatory task on the day is completed. */
export function allMandatoryComplete(tasks: TaskInstance[]): boolean {
  const mandatory = tasks.filter((t) => t.mandatory && isEligible(t));
  if (mandatory.length === 0) return false;
  return mandatory.every((t) => t.status === 'completed');
}

export interface CategoryConsistency {
  category: string;
  scheduled: number;
  completed: number;
  percent: number;
}

export function categoryBreakdown(tasks: TaskInstance[]): CategoryConsistency[] {
  const byCategory = new Map<string, { scheduled: number; completed: number }>();
  for (const task of tasks) {
    if (!isEligible(task)) continue;
    const key = task.category || 'Uncategorised';
    const bucket = byCategory.get(key) ?? { scheduled: 0, completed: 0 };
    bucket.scheduled += 1;
    if (task.status === 'completed') bucket.completed += 1;
    byCategory.set(key, bucket);
  }
  return [...byCategory.entries()]
    .map(([category, bucket]) => ({
      category,
      scheduled: bucket.scheduled,
      completed: bucket.completed,
      percent: bucket.scheduled === 0 ? 0 : round((bucket.completed / bucket.scheduled) * 100, 1),
    }))
    .sort((a, b) => b.percent - a.percent || b.scheduled - a.scheduled);
}

export interface WeeklyTaskAnalysis {
  /** How many of the requested days have already happened. */
  elapsedDays: number;
  totalScheduled: number;
  completed: number;
  missed: number;
  excused: number;
  percent: number;
  mandatoryPercent: number;
  mostConsistent: CategoryConsistency | null;
  leastConsistent: CategoryConsistency | null;
  byDay: { date: ISODate; percent: number; completed: number; eligible: number }[];
}

/**
 * Aggregates cover the days that have actually happened, so a week still in
 * progress is not judged against days that have not arrived yet. The day-by-day
 * chart still shows the whole week.
 */
export function weeklyTaskAnalysis(
  tasksByDate: Map<ISODate, TaskInstance[]>,
  dates: ISODate[],
  today: ISODate,
): WeeklyTaskAnalysis {
  const elapsed = dates.filter((date) => date <= today);
  const all = elapsed.flatMap((date) => tasksByDate.get(date) ?? []);
  const overall = computeTaskStats(all, null, null);
  const mandatory = computeTaskStats(all.filter((t) => t.mandatory), null, null);

  let missed = 0;
  const byDay = dates.map((date) => {
    const stats = computeTaskStats(tasksByDate.get(date) ?? [], date, today);
    missed += stats.missed;
    return { date, percent: stats.percent, completed: stats.completed, eligible: stats.eligible };
  });

  const categories = categoryBreakdown(all).filter((c) => c.scheduled >= 1);

  return {
    elapsedDays: elapsed.length,
    totalScheduled: overall.scheduled,
    completed: overall.completed,
    missed,
    excused: overall.excused,
    percent: overall.percent,
    mandatoryPercent: mandatory.percent,
    mostConsistent: categories.length > 0 ? categories[0] : null,
    leastConsistent: categories.length > 1 ? categories[categories.length - 1] : null,
    byDay,
  };
}
