import type { DaySummary } from './daySummary';
import type { ISODate, Settings, Subject } from '../types/models';
import { computeStreaks, evaluateDay } from './calc/streak';
import type { DayEvaluation, StreakResult } from './calc/streak';
import { categoryBreakdown } from './calc/tasks';
import type { CategoryConsistency } from './calc/tasks';
import { subjectDistribution } from './calc/study';
import type { SubjectDistribution } from './calc/study';
import { formatShortDate } from './date';
import { round } from './validate';

export interface RangeAnalysis {
  dates: ISODate[];
  /** Days in the range that have already happened. */
  elapsedDays: number;
  summaries: DaySummary[];
  evaluations: DayEvaluation[];
  streaks: StreakResult;

  taskScheduled: number;
  taskCompleted: number;
  taskMissed: number;
  taskExcused: number;
  taskPercent: number;
  mandatoryPercent: number;
  missedByCategory: CategoryConsistency[];

  daysWithFood: number;
  calorieTotal: number;
  calorieAverage: number;
  calorieTargetAverage: number;
  proteinAverage: number;
  carbsAverage: number;
  fatAverage: number;
  fibreAverage: number;
  adherencePct: number;

  expenditureAverage: number;
  balanceAverage: number;
  activeCalorieTotal: number;

  gymSessions: number;
  trainingVolumeKg: number;
  runDistanceKm: number;
  runDurationMinutes: number;
  averagePaceMinPerKm: number | null;
  stepsTotal: number;
  stepsAverage: number;

  studyMinutes: number;
  studyTargetMinutes: number;
  studyAverage: number;
  studyDistribution: SubjectDistribution[];
  chaptersCompleted: number;

  bestDay: { date: ISODate; score: number } | null;
  hardestDay: { date: ISODate; score: number } | null;
}

/** A 0-100 score used only to name a "best" and "most difficult" day. */
export function dayScore(summary: DaySummary): number {
  const parts: number[] = [];
  if (summary.tasks.all.eligible > 0) parts.push(Math.min(100, summary.tasks.all.percent));
  if (summary.targets.calories > 0 && summary.nutrition.calories > 0) {
    const ratio = summary.nutrition.calories / summary.targets.calories;
    parts.push(Math.max(0, 100 - Math.abs(1 - ratio) * 200));
  }
  if (summary.targets.steps > 0) parts.push(Math.min(100, (summary.stepCount / summary.targets.steps) * 100));
  if (summary.targets.studyMinutes > 0) parts.push(Math.min(100, (summary.studyTotals.minutes / summary.targets.studyMinutes) * 100));
  if (summary.gym.length > 0 || summary.runs.length > 0) parts.push(100);
  if (parts.length === 0) return 0;
  return round(parts.reduce((sum, value) => sum + value, 0) / parts.length, 1);
}

export function analyseRange(
  dates: ISODate[],
  summaryFor: (date: ISODate) => DaySummary,
  settings: Settings,
  today: ISODate,
  chaptersCompletedInRange: number,
  subjects: Subject[],
): RangeAnalysis {
  const summaries = dates.map(summaryFor);
  const evaluations = summaries.map((summary) => evaluateDay(summary, settings, today));
  const streaks = computeStreaks(evaluations, today);

  // Averages and completion rates count only days that have happened, so a
  // range that runs into the future is not judged against days yet to come.
  const elapsed = summaries.filter((summary) => summary.date <= today);
  const elapsedCount = Math.max(1, elapsed.length);

  const allTasks = elapsed.flatMap((summary) => summary.taskList);
  const taskScheduled = allTasks.length;
  const taskCompleted = elapsed.reduce((sum, s) => sum + s.tasks.all.completed, 0);
  const taskMissed = elapsed.reduce((sum, s) => sum + s.tasks.all.missed, 0);
  const taskExcused = elapsed.reduce((sum, s) => sum + s.tasks.all.excused, 0);
  const eligible = elapsed.reduce((sum, s) => sum + s.tasks.all.eligible, 0);
  const mandatoryEligible = elapsed.reduce((sum, s) => sum + s.tasks.mandatory.eligible, 0);
  const mandatoryCompleted = elapsed.reduce((sum, s) => sum + s.tasks.mandatory.completed, 0);

  const withFood = elapsed.filter((s) => s.nutrition.calories > 0);
  const calorieTotal = withFood.reduce((sum, s) => sum + s.nutrition.calories, 0);
  const calorieTargetAverage = elapsed.length === 0 ? 0 : elapsed.reduce((sum, s) => sum + s.targets.calories, 0) / elapsedCount;
  const calorieAverage = withFood.length === 0 ? 0 : calorieTotal / withFood.length;

  const runDistanceKm = summaries.reduce((sum, s) => sum + s.runDistanceKm, 0);
  const runDurationMinutes = summaries.reduce((sum, s) => sum + s.runDurationMinutes, 0);

  const scored = summaries
    .filter((summary) => summary.hasAnyData && summary.date <= today)
    .map((summary) => ({ date: summary.date, score: dayScore(summary) }));
  const bestDay = scored.length > 0 ? scored.reduce((best, day) => (day.score > best.score ? day : best)) : null;
  const hardestDay = scored.length > 0 ? scored.reduce((worst, day) => (day.score < worst.score ? day : worst)) : null;

  const allStudy = summaries.flatMap((summary) => summary.study);

  return {
    dates,
    elapsedDays: elapsed.length,
    summaries,
    evaluations,
    streaks,

    taskScheduled,
    taskCompleted,
    taskMissed,
    taskExcused,
    taskPercent: eligible === 0 ? 0 : round((taskCompleted / eligible) * 100, 1),
    mandatoryPercent: mandatoryEligible === 0 ? 0 : round((mandatoryCompleted / mandatoryEligible) * 100, 1),
    missedByCategory: categoryBreakdown(allTasks),

    daysWithFood: withFood.length,
    calorieTotal: round(calorieTotal, 0),
    calorieAverage: round(calorieAverage, 0),
    calorieTargetAverage: round(calorieTargetAverage, 0),
    proteinAverage: withFood.length === 0 ? 0 : round(withFood.reduce((sum, s) => sum + s.nutrition.protein, 0) / withFood.length, 1),
    carbsAverage: withFood.length === 0 ? 0 : round(withFood.reduce((sum, s) => sum + s.nutrition.carbs, 0) / withFood.length, 1),
    fatAverage: withFood.length === 0 ? 0 : round(withFood.reduce((sum, s) => sum + s.nutrition.fat, 0) / withFood.length, 1),
    fibreAverage: withFood.length === 0 ? 0 : round(withFood.reduce((sum, s) => sum + s.nutrition.fibre, 0) / withFood.length, 1),
    adherencePct: calorieTargetAverage === 0 ? 0 : round((calorieAverage / calorieTargetAverage) * 100, 1),

    expenditureAverage: elapsed.length === 0 ? 0 : round(elapsed.reduce((sum, s) => sum + s.energy.totalExpenditure, 0) / elapsedCount, 0),
    balanceAverage: withFood.length === 0 ? 0 : round(withFood.reduce((sum, s) => sum + s.energy.balance, 0) / withFood.length, 0),
    activeCalorieTotal: round(summaries.reduce((sum, s) => sum + s.active.total, 0), 0),

    gymSessions: summaries.reduce((sum, s) => sum + s.gym.length, 0),
    trainingVolumeKg: round(summaries.reduce((sum, s) => sum + s.trainingVolumeKg, 0), 0),
    runDistanceKm: round(runDistanceKm, 2),
    runDurationMinutes: round(runDurationMinutes, 0),
    averagePaceMinPerKm: runDistanceKm > 0 ? round(runDurationMinutes / runDistanceKm, 2) : null,
    stepsTotal: summaries.reduce((sum, s) => sum + s.stepCount, 0),
    stepsAverage: elapsed.length === 0 ? 0 : round(elapsed.reduce((sum, s) => sum + s.stepCount, 0) / elapsedCount, 0),

    studyMinutes: summaries.reduce((sum, s) => sum + s.studyTotals.minutes, 0),
    studyTargetMinutes: elapsed.reduce((sum, s) => sum + s.targets.studyMinutes, 0),
    studyAverage: elapsed.length === 0 ? 0 : round(elapsed.reduce((sum, s) => sum + s.studyTotals.minutes, 0) / elapsedCount, 0),
    studyDistribution: subjectDistribution(allStudy, subjects),
    chaptersCompleted: chaptersCompletedInRange,

    bestDay,
    hardestDay,
  };
}

export interface WeeklyReview {
  achieved: string[];
  missed: string[];
  changes: string[];
  bestDay: string;
  hardestDay: string;
  observations: string[];
  hasEnoughData: boolean;
}

function delta(current: number, previous: number, unit: string, decimals = 0): string {
  const difference = round(current - previous, decimals);
  if (difference === 0) return `unchanged at ${round(current, decimals)}${unit}`;
  return `${difference > 0 ? 'up' : 'down'} ${Math.abs(difference)}${unit} (from ${round(previous, decimals)}${unit})`;
}

/**
 * Deterministic, rule-based review built only from the numbers above.
 * No external service, no invented facts, and no causal claims.
 */
export function buildWeeklyReview(current: RangeAnalysis, previous: RangeAnalysis | null): WeeklyReview {
  const achieved: string[] = [];
  const missed: string[] = [];
  const changes: string[] = [];
  const observations: string[] = [];

  const hasEnoughData = current.summaries.some((summary) => summary.hasAnyData);
  if (!hasEnoughData) {
    return {
      achieved: [],
      missed: [],
      changes: [],
      bestDay: 'No records in this range yet.',
      hardestDay: 'No records in this range yet.',
      observations: ['There are no records in this range, so there is nothing to analyse yet.'],
      hasEnoughData: false,
    };
  }

  if (current.taskScheduled > 0) {
    achieved.push(`${current.taskCompleted} of ${current.taskScheduled} scheduled tasks completed (${current.taskPercent}%).`);
    if (current.taskMissed > 0) missed.push(`${current.taskMissed} task(s) missed or skipped.`);
    if (current.taskExcused > 0) missed.push(`${current.taskExcused} task(s) marked excused and excluded from the percentage.`);
  }
  if (current.daysWithFood > 0) {
    achieved.push(`Calories logged on ${current.daysWithFood} of ${current.elapsedDays} days so far, averaging ${current.calorieAverage} kcal against a ${current.calorieTargetAverage} kcal average target.`);
    if (current.elapsedDays - current.daysWithFood > 0) {
      missed.push(`${current.elapsedDays - current.daysWithFood} day(s) had no food logged.`);
    }
  } else {
    missed.push('No calories were logged in this range.');
  }
  if (current.gymSessions > 0 || current.runDistanceKm > 0) {
    achieved.push(`${current.gymSessions} gym session(s), ${current.trainingVolumeKg} kg of training volume and ${current.runDistanceKm} km run.`);
  } else {
    missed.push('No gym sessions or runs were logged.');
  }
  if (current.studyMinutes > 0) {
    achieved.push(`${current.studyMinutes} minutes of study against a ${current.studyTargetMinutes} minute target for the range.`);
  } else {
    missed.push('No study minutes were logged.');
  }
  if (current.streaks.missedDays > 0) {
    missed.push(`${current.streaks.missedDays} day(s) did not qualify: ${current.streaks.brokenDates.slice(0, 5).map(formatShortDate).join(', ')}${current.streaks.brokenDates.length > 5 ? '…' : ''}.`);
  }

  if (previous && previous.summaries.some((summary) => summary.hasAnyData)) {
    changes.push(`Task completion ${delta(current.taskPercent, previous.taskPercent, '%', 1)}.`);
    changes.push(`Average calories ${delta(current.calorieAverage, previous.calorieAverage, ' kcal')}.`);
    changes.push(`Study minutes ${delta(current.studyMinutes, previous.studyMinutes, ' min')}.`);
    changes.push(`Steps per day ${delta(current.stepsAverage, previous.stepsAverage, '')}.`);
    changes.push(`Running distance ${delta(current.runDistanceKm, previous.runDistanceKm, ' km', 2)}.`);
  } else {
    changes.push('There is no comparable earlier period with records yet.');
  }

  // Observations are descriptive only: they report what the numbers show and
  // never assert that one thing caused another.
  const worstCategory = current.missedByCategory[current.missedByCategory.length - 1];
  if (worstCategory && current.missedByCategory.length > 1 && worstCategory.percent < 100) {
    observations.push(`Your lowest task completion was in "${worstCategory.category}" at ${worstCategory.percent}% of ${worstCategory.scheduled} scheduled.`);
  }
  if (current.daysWithFood > 0 && current.adherencePct < 85) {
    observations.push(`Logged intake averaged ${current.adherencePct}% of target, so either intake or logging was below target on most days.`);
  } else if (current.adherencePct > 115) {
    observations.push(`Logged intake averaged ${current.adherencePct}% of target across the range.`);
  }
  if (current.studyTargetMinutes > 0) {
    const studyPct = round((current.studyMinutes / current.studyTargetMinutes) * 100, 0);
    observations.push(`Study time reached ${studyPct}% of the target for this range (${current.studyMinutes} of ${current.studyTargetMinutes} minutes).`);
  }
  if (current.stepsAverage > 0) {
    observations.push(`Steps averaged ${current.stepsAverage.toLocaleString()} per day over ${current.elapsedDays} recorded day(s).`);
  }
  if (observations.length === 0) {
    observations.push('Not enough recorded values in this range to add a further observation.');
  }

  return {
    achieved,
    missed,
    changes,
    bestDay: current.bestDay
      ? `${formatShortDate(current.bestDay.date)} scored highest on the visible metrics (${current.bestDay.score}/100).`
      : 'No day in this range has enough records to compare.',
    hardestDay: current.hardestDay
      ? `${formatShortDate(current.hardestDay.date)} scored lowest on the visible metrics (${current.hardestDay.score}/100).`
      : 'No day in this range has enough records to compare.',
    observations: observations.slice(0, 3),
    hasEnoughData: true,
  };
}
