import { describe, expect, it } from 'vitest';
import {
  allMandatoryComplete, categoryBreakdown, computeTaskDayStats, computeTaskStats, weeklyTaskAnalysis,
} from '../src/lib/calc/tasks';
import { checkMacroMismatch, dayNutritionTotals, macroDerivedCalories } from '../src/lib/calc/nutrition';
import {
  activeCalories, exerciseVolume, formatPace, metCalories, paceMinPerKm, personalRecords, sessionVolume, speedKmh, toKg,
} from '../src/lib/calc/fitness';
import { energyBalance } from '../src/lib/calc/energy';
import { averageTarget, targetsForDate } from '../src/lib/calc/targets';
import { formatStopwatch, timerElapsedMs } from '../src/lib/calc/study';
import { addDays, dayOfWeek, diffDays, isValidISODate, monthGrid, startOfWeek, toLocalISODate, isWithinWindow } from '../src/lib/date';
import { instanceIdFor, isDueOn, materialiseInstances } from '../src/lib/recurrence';
import { toCsv } from '../src/lib/csv';
import { DEFAULT_TARGETS } from '../src/db/defaults';
import { RECORD_SCHEMA_VERSION } from '../src/types/models';
import type {
  DayNutrition, FoodEntry, GymSession, RunSession, StepEntry, StudyTimer, TargetVersion, TaskInstance, TaskTemplate,
} from '../src/types/models';

const NOW = '2026-09-01T06:00:00.000Z';
const base = { createdAt: NOW, updatedAt: NOW, v: RECORD_SCHEMA_VERSION };
const dated = (date: string) => ({ ...base, date, tz: 'Asia/Karachi' });

function task(overrides: Partial<TaskInstance>): TaskInstance {
  return {
    ...dated('2026-09-01'),
    id: overrides.id ?? Math.random().toString(36).slice(2),
    templateId: null,
    title: 'Task',
    description: '',
    category: 'Routine',
    dueTime: null,
    estimatedMinutes: null,
    priority: 'medium',
    mandatory: false,
    notes: '',
    status: 'pending',
    completedAt: null,
    order: 0,
    carriedToDate: null,
    carriedFromId: null,
    ...overrides,
  };
}

/* ------------------------------------------------------------------- dates */

describe('time-zone aware dates', () => {
  it('resolves the local calendar date, not the UTC one', () => {
    // 2026-09-01T19:30Z is already 2026-09-02 in Karachi (UTC+5).
    expect(toLocalISODate('2026-09-01T19:30:00.000Z', 'Asia/Karachi')).toBe('2026-09-02');
    expect(toLocalISODate('2026-09-01T19:30:00.000Z', 'UTC')).toBe('2026-09-01');
    // ...and still the previous day in New York.
    expect(toLocalISODate('2026-09-01T03:30:00.000Z', 'America/New_York')).toBe('2026-08-31');
  });

  it('adds days across daylight-saving changes without slipping', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-01-01', '2026-12-31')).toBe(364);
  });

  it('starts the week on the configured day', () => {
    expect(dayOfWeek('2026-09-01')).toBe(2); // Tuesday
    expect(startOfWeek('2026-09-01', 'monday')).toBe('2026-08-31');
    expect(startOfWeek('2026-09-01', 'sunday')).toBe('2026-08-30');
  });

  it('builds a six-week month grid', () => {
    const grid = monthGrid('2026-09-15', 'monday');
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-08-31');
    expect(grid).toContain('2026-09-30');
  });

  it('validates ISO dates', () => {
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2028-02-29')).toBe(true);
    expect(isValidISODate('not-a-date')).toBe(false);
  });

  it('handles quiet-hours windows that cross midnight', () => {
    expect(isWithinWindow('23:30', '22:30', '07:00')).toBe(true);
    expect(isWithinWindow('06:59', '22:30', '07:00')).toBe(true);
    expect(isWithinWindow('12:00', '22:30', '07:00')).toBe(false);
  });
});

/* ------------------------------------------------------------------- tasks */

describe('task completion percentages', () => {
  it('excludes cancelled and excused tasks from the denominator', () => {
    const tasks = [
      task({ status: 'completed' }),
      task({ status: 'completed' }),
      task({ status: 'skipped' }),
      task({ status: 'excused' }),
      task({ status: 'cancelled' }),
    ];
    const stats = computeTaskStats(tasks);
    expect(stats.eligible).toBe(3);
    expect(stats.completed).toBe(2);
    expect(stats.excused).toBe(1);
    expect(stats.cancelled).toBe(1);
    expect(stats.percent).toBeCloseTo(66.7, 1);
  });

  it('counts skipped tasks as missed and pending past days as missed', () => {
    const tasks = [task({ status: 'skipped' }), task({ status: 'pending' })];
    expect(computeTaskStats(tasks, '2026-09-01', '2026-09-01').missed).toBe(1);
    expect(computeTaskStats(tasks, '2026-08-31', '2026-09-01').missed).toBe(2);
  });

  it('reports mandatory tasks separately', () => {
    const stats = computeTaskDayStats([
      task({ mandatory: true, status: 'completed' }),
      task({ mandatory: true, status: 'pending' }),
      task({ mandatory: false, status: 'completed' }),
    ]);
    expect(stats.all.percent).toBeCloseTo(66.7, 1);
    expect(stats.mandatory.percent).toBe(50);
    expect(allMandatoryComplete([task({ mandatory: true, status: 'completed' })])).toBe(true);
    expect(allMandatoryComplete([])).toBe(false);
  });

  it('returns 0% rather than dividing by zero', () => {
    expect(computeTaskStats([]).percent).toBe(0);
  });

  it('judges a week in progress only on the days that have happened', () => {
    const byDate = new Map([
      ['2026-08-31', [task({ date: '2026-08-31', status: 'completed' })]],
      ['2026-09-01', [task({ date: '2026-09-01', status: 'completed' })]],
      // Future days still carry scheduled instances, but must not drag the rate down.
      ['2026-09-02', [task({ date: '2026-09-02', status: 'pending' })]],
      ['2026-09-03', [task({ date: '2026-09-03', status: 'pending' })]],
    ]);
    const weekly = weeklyTaskAnalysis(byDate, ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03'], '2026-09-01');
    expect(weekly.elapsedDays).toBe(2);
    expect(weekly.totalScheduled).toBe(2);
    expect(weekly.percent).toBe(100);
    expect(weekly.missed).toBe(0);
    expect(weekly.byDay).toHaveLength(4);
  });

  it('breaks completion down by category', () => {
    const rows = categoryBreakdown([
      task({ category: 'Health', status: 'completed' }),
      task({ category: 'Health', status: 'skipped' }),
      task({ category: 'Work', status: 'completed' }),
    ]);
    expect(rows[0]).toMatchObject({ category: 'Work', percent: 100 });
    expect(rows[1]).toMatchObject({ category: 'Health', percent: 50 });
  });
});

/* --------------------------------------------------------------- recurrence */

describe('recurrence', () => {
  const template: TaskTemplate = {
    ...base,
    id: 'tpl',
    title: 'Gym',
    description: '',
    category: 'Health',
    dueTime: null,
    estimatedMinutes: null,
    priority: 'medium',
    mandatory: true,
    notes: '',
    recurrence: { kind: 'weekdays', daysOfWeek: [1, 3, 5], intervalDays: 1, startDate: '2026-08-31', endDate: null },
    archived: false,
    order: 0,
    tz: 'Asia/Karachi',
  };

  it('matches only the selected weekdays', () => {
    expect(isDueOn(template.recurrence, '2026-08-31')).toBe(true); // Monday
    expect(isDueOn(template.recurrence, '2026-09-01')).toBe(false); // Tuesday
    expect(isDueOn(template.recurrence, '2026-09-02')).toBe(true); // Wednesday
  });

  it('honours interval recurrence and end dates', () => {
    const every3 = { kind: 'interval' as const, daysOfWeek: [], intervalDays: 3, startDate: '2026-09-01', endDate: '2026-09-10' };
    expect(isDueOn(every3, '2026-09-01')).toBe(true);
    expect(isDueOn(every3, '2026-09-04')).toBe(true);
    expect(isDueOn(every3, '2026-09-05')).toBe(false);
    expect(isDueOn(every3, '2026-09-13')).toBe(false); // past the end date
  });

  it('never creates instances before the template existed', () => {
    const created = materialiseInstances([template], [], ['2026-08-24', '2026-08-31', '2026-09-02'], 'Asia/Karachi');
    // createdAt is 2026-09-01, so 2026-08-24 and 2026-08-31 are skipped.
    expect(created.map((instance) => instance.date)).toEqual(['2026-09-02']);
  });

  it('gives a template/date pair one stable id, so a repeated write cannot duplicate it', () => {
    const [first] = materialiseInstances([template], [], ['2026-09-02'], 'Asia/Karachi');
    const [second] = materialiseInstances([template], [], ['2026-09-02'], 'Asia/Karachi');
    expect(first.id).toBe(instanceIdFor(template.id, '2026-09-02'));
    expect(second.id).toBe(first.id);
  });

  it('does not regenerate an instance that already exists', () => {
    const existing = [task({ id: 'a', templateId: 'tpl', date: '2026-09-02', status: 'cancelled' })];
    const created = materialiseInstances([template], existing, ['2026-09-02', '2026-09-04'], 'Asia/Karachi');
    expect(created.map((instance) => instance.date)).toEqual(['2026-09-04']);
  });
});

/* --------------------------------------------------------------- nutrition */

describe('nutrition totals', () => {
  const entries: FoodEntry[] = [
    { ...dated('2026-09-01'), id: 'f1', meal: 'Breakfast', name: 'Oats', quantity: '', calories: 400, protein: 20, carbs: 60, fat: 8, fibre: 6, time: null, notes: '' },
    { ...dated('2026-09-01'), id: 'f2', meal: 'Lunch', name: 'Chicken', quantity: '', calories: 600, protein: 50, carbs: 40, fat: 20, fibre: 4, time: null, notes: '' },
  ];
  const quickDay: DayNutrition = {
    ...dated('2026-09-01'), id: 'd1', mode: 'quick', quickCalories: 1800, quickProtein: 120, quickCarbs: 180, quickFat: 60,
    quickFibre: 20, waterMl: 0, bodyWeightKg: null,
  };

  it('sums itemised entries', () => {
    const totals = dayNutritionTotals({ ...quickDay, mode: 'itemised' }, entries);
    expect(totals).toMatchObject({ calories: 1000, protein: 70, carbs: 100, fat: 28, fibre: 10, mode: 'itemised' });
  });

  it('uses quick totals instead of entries so nothing is double-counted', () => {
    const totals = dayNutritionTotals(quickDay, entries);
    expect(totals.calories).toBe(1800);
    expect(totals.entryCount).toBe(0);
    expect(totals.mode).toBe('quick');
  });

  it('derives calories from macros at 4/4/9 kcal per gram', () => {
    expect(macroDerivedCalories(100, 200, 50)).toBe(100 * 4 + 200 * 4 + 50 * 9);
  });

  it('warns when entered calories differ materially from the macro estimate', () => {
    const close = checkMacroMismatch(1000, 50, 100, 33);
    expect(close.mismatch).toBe(false);
    const far = checkMacroMismatch(1000, 10, 10, 10);
    expect(far.mismatch).toBe(true);
    expect(far.entered).toBe(1000); // the entered value is preserved
  });
});

/* ----------------------------------------------------------------- fitness */

describe('fitness calculations', () => {
  it('converts pounds to kilograms for volume', () => {
    expect(toKg(100, 'lb')).toBeCloseTo(45.359, 3);
    const volume = exerciseVolume({
      id: 'e', name: 'Bench', muscleGroup: 'Chest', notes: '',
      sets: [
        { id: 's1', setNumber: 1, reps: 10, weight: 60, unit: 'kg', rpe: null, restSeconds: null, notes: '' },
        { id: 's2', setNumber: 2, reps: 8, weight: 100, unit: 'lb', rpe: null, restSeconds: null, notes: '' },
      ],
    });
    expect(volume).toBeCloseTo(10 * 60 + 8 * 45.359237, 1);
  });

  it('calculates pace and speed', () => {
    expect(paceMinPerKm(5, 30)).toBe(6);
    expect(speedKmh(5, 30)).toBe(10);
    expect(formatPace(5, 27.5, 'min/km')).toBe('5:30 /km');
    expect(paceMinPerKm(0, 30)).toBeNull();
  });

  it('applies the MET formula', () => {
    // 8 MET, 70 kg, 60 min => 8 * 3.5 * 70 / 200 * 60 = 588
    expect(metCalories(8, 70, 60)).toBe(588);
    expect(metCalories(0, 70, 60)).toBe(0);
  });

  it('excludes entries marked as already counted from the active total', () => {
    const gym: GymSession = {
      ...dated('2026-09-01'), id: 'g1', name: 'Push', time: null, durationMinutes: 60, muscleGroups: [],
      exercises: [], notes: '', manualCalories: 400, met: 6, includedInOtherEstimate: false,
    };
    const run: RunSession = {
      ...dated('2026-09-01'), id: 'r1', type: 'outdoor', time: null, distanceKm: 5, durationMinutes: 30,
      inclinePct: null, avgHeartRate: null, notes: '', manualCalories: 300, met: 9.8, includedInOtherEstimate: true,
    };
    const steps: StepEntry = {
      ...dated('2026-09-01'), id: 'st1', steps: 10000, includedInOtherEstimate: false, manualCalories: 250,
      notes: '', source: 'manual',
    };
    const totals = activeCalories([gym], [run], [steps], 70);
    expect(totals.total).toBe(650);
    expect(totals.excluded).toBe(300);
  });

  it('finds personal records across sessions', () => {
    const session: GymSession = {
      ...dated('2026-09-01'), id: 'g2', name: 'Push', time: null, durationMinutes: 60, muscleGroups: [], notes: '',
      manualCalories: null, met: 6, includedInOtherEstimate: false,
      exercises: [
        {
          id: 'e1', name: 'Bench press', muscleGroup: 'Chest', notes: '',
          sets: [
            { id: 's1', setNumber: 1, reps: 5, weight: 100, unit: 'kg', rpe: null, restSeconds: null, notes: '' },
            { id: 's2', setNumber: 2, reps: 12, weight: 80, unit: 'kg', rpe: null, restSeconds: null, notes: '' },
          ],
        },
      ],
    };
    const [record] = personalRecords([session]);
    expect(record.bestWeightKg).toBe(100);
    expect(record.bestReps).toBe(12);
    expect(record.bestVolumeKg).toBe(5 * 100 + 12 * 80);
    expect(sessionVolume(session)).toBe(1460);
  });
});

/* ------------------------------------------------------------ energy balance */

describe('energy balance', () => {
  const targets = { ...DEFAULT_TARGETS, baselineExpenditure: 1900, tdee: 2500 };

  it('adds active calories under Method A', () => {
    const result = energyBalance('baseline_plus_exercise', targets, 2000, 500);
    expect(result.totalExpenditure).toBe(2400);
    expect(result.balance).toBe(400);
    expect(result.label).toBe('estimated deficit');
    expect(result.activeCounted).toBe(true);
  });

  it('does not add exercise again under Method B', () => {
    const result = energyBalance('full_tdee', targets, 2000, 500);
    expect(result.totalExpenditure).toBe(2500);
    expect(result.balance).toBe(500);
    expect(result.activeCounted).toBe(false);
  });

  it('reports a surplus by absolute value', () => {
    const result = energyBalance('full_tdee', targets, 3000, 0);
    expect(result.balance).toBe(-500);
    expect(result.label).toBe('estimated surplus');
    expect(result.magnitude).toBe(500);
  });
});

/* ------------------------------------------------------------------ targets */

describe('versioned targets', () => {
  const version = (effectiveFrom: string, calories: number, createdAt = NOW): TargetVersion => ({
    ...base,
    createdAt,
    id: `v-${effectiveFrom}`,
    effectiveFrom,
    tz: 'Asia/Karachi',
    targets: { ...DEFAULT_TARGETS, calories },
  });

  const versions = [version('2026-01-01', 2000), version('2026-09-02', 2400)];

  it('uses the version in force on the day', () => {
    expect(targetsForDate(versions, '2026-09-01').calories).toBe(2000);
    expect(targetsForDate(versions, '2026-09-02').calories).toBe(2400);
    expect(targetsForDate(versions, '2026-12-31').calories).toBe(2400);
  });

  it('leaves historical days untouched when a future target is added', () => {
    const before = targetsForDate(versions, '2026-08-20').calories;
    const withFuture = [...versions, version('2027-01-01', 3000)];
    expect(targetsForDate(withFuture, '2026-08-20').calories).toBe(before);
  });

  it('falls back to the earliest version for dates before it', () => {
    expect(targetsForDate([version('2026-09-05', 2600)], '2026-09-01').calories).toBe(2600);
  });

  it('averages a target across a range spanning a change', () => {
    const average = averageTarget(versions, ['2026-09-01', '2026-09-02'], 'calories');
    expect(average).toBe(2200);
  });
});

/* -------------------------------------------------------------- study timer */

describe('study timer', () => {
  const timer: StudyTimer = {
    ...base, id: 'study-timer', active: true, subjectId: null, chapterId: null, topic: '',
    startedAt: '2026-09-01T10:00:00.000Z', accumulatedMs: 5 * 60_000, running: true,
  };

  it('derives elapsed time from stored timestamps, not a running interval', () => {
    const now = Date.parse('2026-09-01T10:07:30.000Z');
    expect(timerElapsedMs(timer, now)).toBe(5 * 60_000 + 7.5 * 60_000);
  });

  it('keeps accumulated time while paused', () => {
    expect(timerElapsedMs({ ...timer, running: false, startedAt: null }, Date.now())).toBe(5 * 60_000);
  });

  it('reports nothing when the timer is not active', () => {
    expect(timerElapsedMs({ ...timer, active: false }, Date.now())).toBe(0);
  });

  it('formats the stopwatch', () => {
    expect(formatStopwatch(90_000)).toBe('01:30');
    expect(formatStopwatch(3_725_000)).toBe('1:02:05');
  });
});

/* --------------------------------------------------------------------- csv */

describe('csv escaping', () => {
  it('quotes separators and neutralises formula prefixes', () => {
    const csv = toCsv(['a', 'b'], [['plain', 'has,comma'], ['=SUM(A1)', 'line\nbreak']]);
    expect(csv).toContain('"has,comma"');
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain('"line\nbreak"');
  });
});
