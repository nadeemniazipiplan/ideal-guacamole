import type { DataIndex } from './dataIndex';
import type {
  DayNote,
  GymSession,
  ISODate,
  RunSession,
  Settings,
  StepEntry,
  StudySession,
  TargetSet,
  TargetVersion,
  TaskInstance,
} from '../types/models';
import { computeTaskDayStats } from './calc/tasks';
import type { TaskDayStats } from './calc/tasks';
import { dayNutritionTotals, nutritionProgress } from './calc/nutrition';
import type { NutritionProgress, NutritionTotals } from './calc/nutrition';
import { activeCalories, sessionVolume } from './calc/fitness';
import type { ActiveCalorieBreakdown } from './calc/fitness';
import { energyBalance } from './calc/energy';
import type { EnergyBalance } from './calc/energy';
import { studyTotals } from './calc/study';
import type { StudyTotals } from './calc/study';
import { targetsForDate } from './calc/targets';
import { round } from './validate';

export interface DaySummary {
  date: ISODate;
  targets: TargetSet;
  tasks: TaskDayStats;
  taskList: TaskInstance[];
  nutrition: NutritionTotals;
  nutritionProgress: NutritionProgress;
  gym: GymSession[];
  runs: RunSession[];
  steps: StepEntry | undefined;
  stepCount: number;
  trainingVolumeKg: number;
  runDistanceKm: number;
  runDurationMinutes: number;
  active: ActiveCalorieBreakdown;
  energy: EnergyBalance;
  study: StudySession[];
  studyTotals: StudyTotals;
  note: DayNote | undefined;
  hasAnyData: boolean;
}

export function buildDaySummary(
  date: ISODate,
  index: DataIndex,
  settings: Settings,
  targetVersions: TargetVersion[],
  today: ISODate,
): DaySummary {
  const targets = targetsForDate(targetVersions, date);
  const taskList = [...(index.tasks.get(date) ?? [])].sort(
    (a, b) => a.order - b.order || (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99'),
  );
  const foodEntries = index.food.get(date) ?? [];
  const dayNutrition = index.nutrition.get(date);
  const nutrition = dayNutritionTotals(dayNutrition, foodEntries);
  const gym = index.gym.get(date) ?? [];
  const runs = index.runs.get(date) ?? [];
  const steps = index.steps.get(date);
  const study = index.study.get(date) ?? [];
  const note = index.notes.get(date);

  const active = activeCalories(gym, runs, steps ? [steps] : [], settings.bodyWeightKg);
  const energy = energyBalance(settings.expenditureMethod, targets, nutrition.calories, active.total);

  return {
    date,
    targets,
    tasks: computeTaskDayStats(taskList, date, today),
    taskList,
    nutrition,
    nutritionProgress: nutritionProgress(nutrition, targets),
    gym,
    runs,
    steps,
    stepCount: steps?.steps ?? 0,
    trainingVolumeKg: round(gym.reduce((sum, session) => sum + sessionVolume(session), 0), 1),
    runDistanceKm: round(runs.reduce((sum, run) => sum + run.distanceKm, 0), 2),
    runDurationMinutes: round(runs.reduce((sum, run) => sum + run.durationMinutes, 0), 0),
    active,
    energy,
    study,
    studyTotals: studyTotals(study),
    note,
    hasAnyData:
      taskList.length > 0 ||
      foodEntries.length > 0 ||
      (dayNutrition?.mode === 'quick' && dayNutrition.quickCalories > 0) ||
      gym.length > 0 ||
      runs.length > 0 ||
      (steps?.steps ?? 0) > 0 ||
      study.length > 0 ||
      Boolean(note && (note.note || note.mood !== null || note.energy !== null || note.restDay || note.excused)),
  };
}
