import type { DayNutrition, FoodEntry, TargetSet } from '../../types/models';
import { round } from '../validate';

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

export interface NutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  entryCount: number;
  mode: 'itemised' | 'quick';
}

/**
 * A day is either itemised or quick-total, never both, so calories can never be
 * counted twice. The stored day record decides which source is authoritative.
 */
export function dayNutritionTotals(day: DayNutrition | undefined, entries: FoodEntry[]): NutritionTotals {
  const mode = day?.mode ?? 'itemised';
  if (mode === 'quick' && day) {
    return {
      calories: round(day.quickCalories, 1),
      protein: round(day.quickProtein, 1),
      carbs: round(day.quickCarbs, 1),
      fat: round(day.quickFat, 1),
      fibre: round(day.quickFibre, 1),
      entryCount: 0,
      mode: 'quick',
    };
  }
  const totals = entries.reduce(
    (acc, entry) => ({
      calories: acc.calories + entry.calories,
      protein: acc.protein + entry.protein,
      carbs: acc.carbs + entry.carbs,
      fat: acc.fat + entry.fat,
      fibre: acc.fibre + entry.fibre,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
  );
  return {
    calories: round(totals.calories, 1),
    protein: round(totals.protein, 1),
    carbs: round(totals.carbs, 1),
    fat: round(totals.fat, 1),
    fibre: round(totals.fibre, 1),
    entryCount: entries.length,
    mode: 'itemised',
  };
}

/** Atwater estimate: 4 kcal/g protein and carbohydrate, 9 kcal/g fat. */
export function macroDerivedCalories(protein: number, carbs: number, fat: number): number {
  return round(protein * KCAL_PER_G.protein + carbs * KCAL_PER_G.carbs + fat * KCAL_PER_G.fat, 0);
}

export interface MacroMismatch {
  mismatch: boolean;
  derived: number;
  entered: number;
  differencePct: number;
}

/**
 * Flags a material difference between entered calories and the macro estimate.
 * The user's entered value is always kept; this is advisory only.
 */
export function checkMacroMismatch(
  entered: number,
  protein: number,
  carbs: number,
  fat: number,
  tolerancePct = 15,
): MacroMismatch {
  const derived = macroDerivedCalories(protein, carbs, fat);
  if (entered <= 0 || derived <= 0) {
    return { mismatch: false, derived, entered, differencePct: 0 };
  }
  const differencePct = round((Math.abs(derived - entered) / entered) * 100, 1);
  return { mismatch: differencePct > tolerancePct, derived, entered, differencePct };
}

export interface TargetProgress {
  value: number;
  target: number;
  remaining: number;
  percent: number;
}

export function progress(value: number, target: number): TargetProgress {
  const safeTarget = target > 0 ? target : 0;
  return {
    value: round(value, 1),
    target: safeTarget,
    remaining: round(safeTarget - value, 1),
    percent: safeTarget === 0 ? 0 : round((value / safeTarget) * 100, 1),
  };
}

export interface NutritionProgress {
  calories: TargetProgress;
  protein: TargetProgress;
  carbs: TargetProgress;
  fat: TargetProgress;
  fibre: TargetProgress;
}

export function nutritionProgress(totals: NutritionTotals, targets: TargetSet): NutritionProgress {
  return {
    calories: progress(totals.calories, targets.calories),
    protein: progress(totals.protein, targets.protein),
    carbs: progress(totals.carbs, targets.carbs),
    fat: progress(totals.fat, targets.fat),
    fibre: progress(totals.fibre, targets.fibre),
  };
}

export function groupByMeal(entries: FoodEntry[]): Map<string, FoodEntry[]> {
  const groups = new Map<string, FoodEntry[]>();
  for (const entry of entries) {
    const key = entry.meal || 'Other';
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));
  }
  return groups;
}
