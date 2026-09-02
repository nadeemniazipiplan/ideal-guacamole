import { describe, expect, it } from 'vitest';
import { buildIndex } from '../src/lib/dataIndex';
import { buildDaySummary } from '../src/lib/daySummary';
import { computeStreaks, evaluateDay, moduleStreak } from '../src/lib/calc/streak';
import { createDefaultSettings, createEmptyTimer, DEFAULT_TARGETS } from '../src/db/defaults';
import { rangeDates } from '../src/lib/date';
import { RECORD_SCHEMA_VERSION } from '../src/types/models';
import type { DataSnapshot } from '../src/db/repo';
import type { DayNote, FoodEntry, ISODate, Settings, StepEntry, TargetVersion, TaskInstance } from '../src/types/models';

const NOW = '2026-09-01T06:00:00.000Z';
const TZ = 'Asia/Karachi';
const base = { createdAt: NOW, updatedAt: NOW, v: RECORD_SCHEMA_VERSION };

const targetVersion: TargetVersion = {
  ...base,
  id: 'target-1',
  effectiveFrom: '2026-01-01',
  tz: TZ,
  targets: { ...DEFAULT_TARGETS, calories: 2000, steps: 8000, studyMinutes: 60 },
};

function emptySnapshot(settings: Settings): DataSnapshot {
  return {
    settings,
    targetVersions: [targetVersion],
    taskTemplates: [],
    taskInstances: [],
    foodEntries: [],
    dayNutrition: [],
    gymSessions: [],
    workoutTemplates: [],
    runSessions: [],
    stepEntries: [],
    subjects: [],
    chapters: [],
    studySessions: [],
    studyTimer: createEmptyTimer(),
    dayNotes: [],
  };
}

function mandatoryTask(date: ISODate, status: TaskInstance['status']): TaskInstance {
  return {
    ...base, date, tz: TZ, id: `task-${date}`, templateId: null, title: 'Mandatory', description: '',
    category: 'Routine', dueTime: null, estimatedMinutes: null, priority: 'high', mandatory: true, notes: '',
    status, completedAt: null, order: 0, carriedToDate: null, carriedFromId: null,
  };
}

function food(date: ISODate, calories: number): FoodEntry {
  return {
    ...base, date, tz: TZ, id: `food-${date}`, meal: 'Lunch', name: 'Meal', quantity: '',
    calories, protein: 120, carbs: 200, fat: 60, fibre: 20, time: null, notes: '',
  };
}

function steps(date: ISODate, count: number): StepEntry {
  return { ...base, date, tz: TZ, id: `steps-${date}`, steps: count, includedInOtherEstimate: false, manualCalories: null, notes: '', source: 'manual' };
}

function note(date: ISODate, patch: Partial<DayNote>): DayNote {
  return { ...base, date, tz: TZ, id: `note-${date}`, note: '', mood: null, energy: null, restDay: false, excused: false, ...patch };
}

function settingsWith(rules: Partial<Settings['streakRules']>): Settings {
  const settings = createDefaultSettings(TZ);
  return {
    ...settings,
    timeZone: TZ,
    streakRules: {
      ...settings.streakRules,
      requireMandatoryTasks: true,
      requireCalorieRange: true,
      requireSteps: true,
      requireStudyMinutes: false,
      ...rules,
    },
  };
}

function evaluateDays(snapshot: DataSnapshot, dates: ISODate[], today: ISODate) {
  const index = buildIndex(snapshot);
  return dates.map((date) => evaluateDay(buildDaySummary(date, index, snapshot.settings, snapshot.targetVersions, today), snapshot.settings, today));
}

describe('day qualification', () => {
  const today = '2026-09-05';

  it('qualifies a day where every switched-on condition is met', () => {
    const settings = settingsWith({});
    const snapshot = emptySnapshot(settings);
    snapshot.taskInstances = [mandatoryTask('2026-09-04', 'completed')];
    snapshot.foodEntries = [food('2026-09-04', 1950)];
    snapshot.stepEntries = [steps('2026-09-04', 9000)];

    const [evaluation] = evaluateDays(snapshot, ['2026-09-04'], today);
    expect(evaluation.outcome).toBe('success');
    expect(evaluation.conditions.every((condition) => condition.met)).toBe(true);
  });

  it('explains exactly why a day did not qualify', () => {
    const settings = settingsWith({});
    const snapshot = emptySnapshot(settings);
    snapshot.taskInstances = [mandatoryTask('2026-09-04', 'skipped')];
    snapshot.foodEntries = [food('2026-09-04', 900)];
    snapshot.stepEntries = [steps('2026-09-04', 2000)];

    const [evaluation] = evaluateDays(snapshot, ['2026-09-04'], today);
    expect(evaluation.outcome).toBe('missed');
    expect(evaluation.reason).toContain('All mandatory tasks completed');
    expect(evaluation.reason).toContain('Step target reached');
  });

  it('treats calories outside the configured band as a miss', () => {
    const settings = settingsWith({ requireMandatoryTasks: false, requireSteps: false, calorieRangeLowPct: 85, calorieRangeHighPct: 110 });
    const snapshot = emptySnapshot(settings);
    snapshot.foodEntries = [food('2026-09-04', 2400)]; // 120% of a 2000 target
    const [evaluation] = evaluateDays(snapshot, ['2026-09-04'], today);
    expect(evaluation.outcome).toBe('missed');
  });

  it('counts a planned rest day as a success when configured that way', () => {
    const settings = settingsWith({ restDays: [5], restDaysCountAsSuccess: true });
    const snapshot = emptySnapshot(settings);
    const [evaluation] = evaluateDays(snapshot, ['2026-09-04'], today); // Friday
    expect(evaluation.outcome).toBe('rest');
  });

  it('skips an excused day instead of breaking the streak', () => {
    const settings = settingsWith({});
    const snapshot = emptySnapshot(settings);
    snapshot.dayNotes = [note('2026-09-04', { excused: true })];
    const [evaluation] = evaluateDays(snapshot, ['2026-09-04'], today);
    expect(evaluation.outcome).toBe('excused');
  });

  it('marks future dates as upcoming', () => {
    const snapshot = emptySnapshot(settingsWith({}));
    const [evaluation] = evaluateDays(snapshot, ['2026-09-09'], today);
    expect(evaluation.outcome).toBe('future');
  });
});

describe('streak counting', () => {
  const today = '2026-09-07';
  const dates = rangeDates('2026-09-01', today);

  function snapshotWithGoodDays(goodDates: ISODate[], settings = settingsWith({ requireCalorieRange: false, requireSteps: false })): DataSnapshot {
    const snapshot = emptySnapshot(settings);
    snapshot.taskInstances = dates.map((date) => mandatoryTask(date, goodDates.includes(date) ? 'completed' : 'skipped'));
    return snapshot;
  }

  it('counts consecutive successful days up to today', () => {
    const good = ['2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07'];
    const streaks = computeStreaks(evaluateDays(snapshotWithGoodDays(good), dates, today), today);
    expect(streaks.current).toBe(4);
    expect(streaks.longest).toBe(4);
    expect(streaks.successfulDays).toBe(4);
    expect(streaks.missedDays).toBe(3);
    expect(streaks.brokenDates).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('does not let an unfinished today break the streak', () => {
    const good = ['2026-09-05', '2026-09-06'];
    const streaks = computeStreaks(evaluateDays(snapshotWithGoodDays(good), dates, today), today);
    expect(streaks.current).toBe(2);
  });

  it('lets an excused day bridge a streak', () => {
    const settings = settingsWith({ requireCalorieRange: false, requireSteps: false });
    const snapshot = snapshotWithGoodDays(['2026-09-05', '2026-09-07'], settings);
    snapshot.dayNotes = [note('2026-09-06', { excused: true })];
    const streaks = computeStreaks(evaluateDays(snapshot, dates, today), today);
    expect(streaks.current).toBe(2);
    expect(streaks.excusedDays).toBe(1);
  });

  it('remembers the longest streak even after it is broken', () => {
    const good = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-06'];
    const streaks = computeStreaks(evaluateDays(snapshotWithGoodDays(good), dates, today), today);
    expect(streaks.longest).toBe(3);
    expect(streaks.longestRange).toEqual({ from: '2026-09-01', to: '2026-09-03' });
    // Today (the 7th) is still open, so it does not break anything; the 6th
    // qualified and the 5th did not, leaving a current streak of one day.
    expect(streaks.current).toBe(1);
  });

  it('reports a per-module streak', () => {
    const settings = settingsWith({ requireCalorieRange: false, requireSteps: true });
    const snapshot = emptySnapshot(settings);
    snapshot.taskInstances = dates.map((date) => mandatoryTask(date, 'completed'));
    snapshot.stepEntries = ['2026-09-05', '2026-09-06', '2026-09-07'].map((date) => steps(date, 10_000));
    const evaluations = evaluateDays(snapshot, dates, today);
    expect(moduleStreak(evaluations, 'steps', today)).toBe(3);
    expect(moduleStreak(evaluations, 'tasks', today)).toBe(dates.length);
  });

  it('recalculates when a historical entry changes', () => {
    const settings = settingsWith({ requireCalorieRange: false, requireSteps: false });
    const snapshot = snapshotWithGoodDays(['2026-09-06', '2026-09-07'], settings);
    expect(computeStreaks(evaluateDays(snapshot, dates, today), today).current).toBe(2);

    // Fixing the record for the 5th extends the streak without touching anything else.
    snapshot.taskInstances = snapshot.taskInstances.map((task) =>
      task.date === '2026-09-05' ? { ...task, status: 'completed' as const } : task,
    );
    expect(computeStreaks(evaluateDays(snapshot, dates, today), today).current).toBe(3);
  });
});
