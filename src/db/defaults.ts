import { DEFAULT_TZ, nowInstant, todayISO } from '../lib/date';
import { RECORD_SCHEMA_VERSION } from '../types/models';
import type { PageKey, PageTheme, Settings, StudyTimer, TargetSet, TargetVersion } from '../types/models';
import { uuid } from '../lib/uuid';

export const PAGE_THEME_PRESETS: Record<PageKey, PageTheme> = {
  today: { primary: '#7C3AED', accent: '#F472B6', surface: '#F5F3FF', decor: 'mascot-spark', decorVisible: true, decorOpacity: 0.12 },
  tasks: { primary: '#0891B2', accent: '#22D3EE', surface: '#ECFEFF', decor: 'mascot-leaf-ninja', decorVisible: true, decorOpacity: 0.12 },
  nutrition: { primary: '#B45309', accent: '#FB923C', surface: '#FFF7CC', decor: 'mascot-fruit-spirit', decorVisible: true, decorOpacity: 0.12 },
  fitness: { primary: '#047857', accent: '#FB7185', surface: '#ECFDF5', decor: 'mascot-titan-runner', decorVisible: true, decorOpacity: 0.12 },
  study: { primary: '#4F46E5', accent: '#60A5FA', surface: '#EFF6FF', decor: 'mascot-grimoire', decorVisible: true, decorOpacity: 0.12 },
  calendar: { primary: '#9333EA', accent: '#F9A8D4', surface: '#FDF4FF', decor: 'mascot-pastel-sky', decorVisible: true, decorOpacity: 0.10 },
  analytics: { primary: '#7C3AED', accent: '#A78BFA', surface: '#F5F3FF', decor: 'mascot-spark', decorVisible: true, decorOpacity: 0.10 },
  settings: { primary: '#334155', accent: '#64748B', surface: '#F8FAFC', decor: '', decorVisible: false, decorOpacity: 0.08 },
};

export const DEFAULT_TARGETS: TargetSet = {
  calories: 2200,
  protein: 140,
  carbs: 230,
  fat: 70,
  fibre: 30,
  water: 2500,
  steps: 8000,
  studyMinutes: 120,
  baselineExpenditure: 1900,
  tdee: 2500,
  weeklyWorkouts: 4,
  weeklyRunKm: 15,
};

export function createDefaultSettings(tz: string = DEFAULT_TZ): Settings {
  const now = nowInstant();
  return {
    id: 'settings',
    createdAt: now,
    updatedAt: now,
    v: RECORD_SCHEMA_VERSION,
    displayName: '',
    timeZone: tz,
    weekStart: 'monday',
    weightUnit: 'kg',
    distanceUnit: 'km',
    paceUnit: 'min/km',
    expenditureMethod: 'baseline_plus_exercise',
    bodyWeightKg: 70,
    themeMode: 'system',
    reducedMotion: false,
    showDecorations: true,
    pageThemes: JSON.parse(JSON.stringify(PAGE_THEME_PRESETS)) as Record<PageKey, PageTheme>,
    reminders: {
      enabled: true,
      permissionAsked: false,
      useSystemNotifications: false,
      quietHoursStart: '22:30',
      quietHoursEnd: '07:00',
      frequencyMinutes: 120,
      modules: { tasks: true, nutrition: true, fitness: true, steps: true, study: true },
    },
    streakRules: {
      requireMandatoryTasks: true,
      requireCalorieRange: true,
      calorieRangeLowPct: 85,
      calorieRangeHighPct: 110,
      requireProteinMinimum: false,
      proteinMinimumPct: 80,
      requireSteps: true,
      requireWorkout: false,
      requireStudyMinutes: true,
      restDays: [],
      restDaysCountAsSuccess: true,
    },
    trackWater: false,
    trackBodyWeight: false,
    pinEnabled: false,
    pinHash: null,
    autoLockMinutes: 0,
    lastExportAt: null,
    lastSyncAt: null,
    demoDataLoaded: false,
    onboarded: false,
  };
}

export function createInitialTargetVersion(tz: string, today: string = todayISO(tz)): TargetVersion {
  const now = nowInstant();
  return {
    id: uuid(),
    createdAt: now,
    updatedAt: now,
    v: RECORD_SCHEMA_VERSION,
    effectiveFrom: today,
    tz,
    targets: { ...DEFAULT_TARGETS },
    note: 'Starting targets',
  };
}

export function createEmptyTimer(): StudyTimer {
  const now = nowInstant();
  return {
    id: 'study-timer',
    createdAt: now,
    updatedAt: now,
    v: RECORD_SCHEMA_VERSION,
    active: false,
    subjectId: null,
    chapterId: null,
    topic: '',
    startedAt: null,
    accumulatedMs: 0,
    running: false,
  };
}

export const DEFAULT_TASK_CATEGORIES = ['Routine', 'Health', 'Work', 'Study', 'Home', 'Personal'];
export const DEFAULT_MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
export const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full body', 'Cardio'];

/** Reference MET values (Compendium of Physical Activities, rounded). Editable everywhere. */
export const MET_PRESETS: { label: string; met: number }[] = [
  { label: 'Weight training, light/moderate', met: 3.5 },
  { label: 'Weight training, vigorous', met: 6.0 },
  { label: 'Circuit training', met: 8.0 },
  { label: 'Walking, 5 km/h', met: 3.5 },
  { label: 'Walking, brisk 6.5 km/h', met: 5.0 },
  { label: 'Running, 8 km/h', met: 8.3 },
  { label: 'Running, 10 km/h', met: 9.8 },
  { label: 'Running, 12 km/h', met: 11.8 },
  { label: 'Cycling, moderate', met: 8.0 },
  { label: 'Yoga / stretching', met: 2.5 },
];

export const SUBJECT_COLOURS = [
  '#4F46E5', '#0891B2', '#059669', '#D97706', '#DC2626', '#DB2777', '#7C3AED', '#0EA5E9',
];
