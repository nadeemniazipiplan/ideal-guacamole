import type { ISODate, Settings, StreakRuleSettings } from '../../types/models';
import type { DaySummary } from '../daySummary';
import { allMandatoryComplete } from './tasks';
import { dayOfWeek } from '../date';
import { round } from '../validate';

export type DayOutcome = 'success' | 'rest' | 'excused' | 'missed' | 'future';

export interface ConditionResult {
  key: string;
  label: string;
  met: boolean;
  detail: string;
}

export interface DayEvaluation {
  date: ISODate;
  outcome: DayOutcome;
  conditions: ConditionResult[];
  /** Plain-language reason the day did or did not qualify. */
  reason: string;
}

function anyRuleEnabled(rules: StreakRuleSettings): boolean {
  return (
    rules.requireMandatoryTasks ||
    rules.requireCalorieRange ||
    rules.requireProteinMinimum ||
    rules.requireSteps ||
    rules.requireWorkout ||
    rules.requireStudyMinutes
  );
}

/** Evaluates every enabled success condition for one day. */
export function evaluateDay(summary: DaySummary, settings: Settings, today: ISODate): DayEvaluation {
  const rules = settings.streakRules;
  const conditions: ConditionResult[] = [];

  if (summary.date > today) {
    return { date: summary.date, outcome: 'future', conditions, reason: 'This day has not happened yet.' };
  }

  const isRestDay = rules.restDays.includes(dayOfWeek(summary.date)) || summary.note?.restDay === true;
  const isExcused = summary.note?.excused === true;

  if (rules.requireMandatoryTasks) {
    const mandatory = summary.tasks.mandatory;
    const met = mandatory.eligible > 0 && allMandatoryComplete(summary.taskList);
    conditions.push({
      key: 'tasks',
      label: 'All mandatory tasks completed',
      met,
      detail: mandatory.eligible === 0
        ? 'No mandatory tasks were scheduled.'
        : `${mandatory.completed} of ${mandatory.eligible} mandatory tasks completed.`,
    });
  }

  if (rules.requireCalorieRange) {
    const target = summary.targets.calories;
    const low = round((target * rules.calorieRangeLowPct) / 100, 0);
    const high = round((target * rules.calorieRangeHighPct) / 100, 0);
    const intake = summary.nutrition.calories;
    const met = intake > 0 && intake >= low && intake <= high;
    conditions.push({
      key: 'calories',
      label: `Calories within ${rules.calorieRangeLowPct}-${rules.calorieRangeHighPct}% of target`,
      met,
      detail: intake === 0
        ? 'No calories were logged.'
        : `${round(intake, 0)} kcal logged; the qualifying range is ${low}-${high} kcal.`,
    });
  }

  if (rules.requireProteinMinimum) {
    const minimum = round((summary.targets.protein * rules.proteinMinimumPct) / 100, 0);
    const met = summary.nutrition.protein >= minimum && minimum > 0;
    conditions.push({
      key: 'protein',
      label: `Protein at least ${rules.proteinMinimumPct}% of target`,
      met,
      detail: `${round(summary.nutrition.protein, 0)} g logged; ${minimum} g needed.`,
    });
  }

  if (rules.requireSteps) {
    const met = summary.stepCount >= summary.targets.steps && summary.targets.steps > 0;
    conditions.push({
      key: 'steps',
      label: 'Step target reached',
      met,
      detail: `${summary.stepCount.toLocaleString()} of ${summary.targets.steps.toLocaleString()} steps.`,
    });
  }

  if (rules.requireWorkout) {
    const met = summary.gym.length > 0 || summary.runs.length > 0;
    conditions.push({
      key: 'workout',
      label: 'Workout or run completed',
      met,
      detail: met
        ? `${summary.gym.length} gym session(s), ${summary.runs.length} run(s).`
        : 'No gym session or run was logged.',
    });
  }

  if (rules.requireStudyMinutes) {
    const met = summary.studyTotals.minutes >= summary.targets.studyMinutes && summary.targets.studyMinutes > 0;
    conditions.push({
      key: 'study',
      label: 'Study minutes target reached',
      met,
      detail: `${summary.studyTotals.minutes} of ${summary.targets.studyMinutes} minutes.`,
    });
  }

  const allMet = conditions.length > 0 ? conditions.every((c) => c.met) : summary.hasAnyData;

  if (allMet) {
    return {
      date: summary.date,
      outcome: 'success',
      conditions,
      reason: conditions.length === 0
        ? 'No success conditions are switched on, and this day has records.'
        : 'Every switched-on success condition was met.',
    };
  }

  if (isExcused) {
    return {
      date: summary.date,
      outcome: 'excused',
      conditions,
      reason: 'Marked as an excused day, so it neither counts towards nor breaks the streak.',
    };
  }

  if (isRestDay) {
    return {
      date: summary.date,
      outcome: rules.restDaysCountAsSuccess ? 'rest' : 'excused',
      conditions,
      reason: rules.restDaysCountAsSuccess
        ? 'Planned rest day, which counts as a successful day.'
        : 'Planned rest day, which is skipped when counting the streak.',
    };
  }

  if (!anyRuleEnabled(rules)) {
    return {
      date: summary.date,
      outcome: 'missed',
      conditions,
      reason: 'No success conditions are switched on and nothing was recorded on this day.',
    };
  }

  const unmet = conditions.filter((c) => !c.met).map((c) => c.label);
  return {
    date: summary.date,
    outcome: 'missed',
    conditions,
    reason: `Not met: ${unmet.join('; ')}.`,
  };
}

export interface StreakResult {
  current: number;
  longest: number;
  successfulDays: number;
  restDays: number;
  excusedDays: number;
  missedDays: number;
  brokenDates: ISODate[];
  /** Longest streak's date range, when there is one. */
  longestRange: { from: ISODate; to: ISODate } | null;
  weeklySuccessRatePct: number;
}

/**
 * `evaluations` must be ordered oldest -> newest and cover a contiguous range.
 * The current day never breaks a streak while it is still in progress.
 */
export function computeStreaks(evaluations: DayEvaluation[], today: ISODate): StreakResult {
  let longest = 0;
  let running = 0;
  let runningStart: ISODate | null = null;
  let longestRange: { from: ISODate; to: ISODate } | null = null;
  let successfulDays = 0;
  let restDays = 0;
  let excusedDays = 0;
  let missedDays = 0;
  const brokenDates: ISODate[] = [];

  for (const evaluation of evaluations) {
    if (evaluation.outcome === 'future') continue;
    if (evaluation.outcome === 'success' || evaluation.outcome === 'rest') {
      if (evaluation.outcome === 'success') successfulDays += 1;
      else restDays += 1;
      running += 1;
      if (runningStart === null) runningStart = evaluation.date;
      if (running > longest) {
        longest = running;
        longestRange = { from: runningStart, to: evaluation.date };
      }
    } else if (evaluation.outcome === 'excused') {
      excusedDays += 1;
    } else {
      missedDays += 1;
      brokenDates.push(evaluation.date);
      running = 0;
      runningStart = null;
    }
  }

  // Current streak: walk backwards, letting an unfinished today be neutral.
  let current = 0;
  for (let i = evaluations.length - 1; i >= 0; i -= 1) {
    const evaluation = evaluations[i];
    if (evaluation.outcome === 'future') continue;
    if (evaluation.date === today && evaluation.outcome === 'missed') continue;
    if (evaluation.outcome === 'success' || evaluation.outcome === 'rest') current += 1;
    else if (evaluation.outcome === 'excused') continue;
    else break;
  }

  const counted = evaluations.filter((e) => e.outcome !== 'future' && e.outcome !== 'excused').length;
  const wins = successfulDays + restDays;

  return {
    current,
    longest,
    successfulDays,
    restDays,
    excusedDays,
    missedDays,
    brokenDates,
    longestRange,
    weeklySuccessRatePct: counted === 0 ? 0 : round((wins / counted) * 100, 1),
  };
}

/** Per-module streaks (consecutive days a single condition held), ending today. */
export function moduleStreak(
  evaluations: DayEvaluation[],
  key: string,
  today: ISODate,
): number {
  let streak = 0;
  for (let i = evaluations.length - 1; i >= 0; i -= 1) {
    const evaluation = evaluations[i];
    if (evaluation.outcome === 'future') continue;
    const condition = evaluation.conditions.find((c) => c.key === key);
    if (!condition) break;
    if (condition.met) streak += 1;
    else if (evaluation.date === today) continue;
    else break;
  }
  return streak;
}
