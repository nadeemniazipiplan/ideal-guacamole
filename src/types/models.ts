/**
 * Core data model for the Personal Life Dashboard.
 *
 * Conventions used by every stored record:
 *  - `id`        stable UUID (never reused, never derived from content)
 *  - `date`      the *local* calendar date (YYYY-MM-DD) in the user's selected time zone
 *  - `tz`        IANA time zone identifier that `date` was resolved in
 *  - `createdAt` / `updatedAt` ISO-8601 instants (UTC)
 *  - `v`         schema version of the individual record
 */

export const RECORD_SCHEMA_VERSION = 1;

export type ISODate = string; // YYYY-MM-DD (local calendar date)
export type ISOInstant = string; // 2026-09-01T07:15:00.000Z

export interface BaseRecord {
  id: string;
  createdAt: ISOInstant;
  updatedAt: ISOInstant;
  v: number;
}

export interface DatedRecord extends BaseRecord {
  date: ISODate;
  tz: string;
}

/* ------------------------------------------------------------------ settings */

export type WeightUnit = 'kg' | 'lb';
export type DistanceUnit = 'km' | 'mi';
export type WeekStart = 'monday' | 'sunday';
export type ExpenditureMethod = 'baseline_plus_exercise' | 'full_tdee';
export type ThemeMode = 'system' | 'light' | 'dark';

export type PageKey =
  | 'today'
  | 'tasks'
  | 'nutrition'
  | 'fitness'
  | 'study'
  | 'calendar'
  | 'analytics'
  | 'settings';

export interface PageTheme {
  primary: string;
  accent: string;
  surface: string;
  /** key into the bundled decoration set, or '' for none */
  decor: string;
  decorVisible: boolean;
  decorOpacity: number; // 0.04 - 0.30
}

export interface ReminderSettings {
  enabled: boolean;
  /** Whether the user has been asked for browser notification permission already. */
  permissionAsked: boolean;
  useSystemNotifications: boolean;
  quietHoursStart: string; // HH:mm
  quietHoursEnd: string; // HH:mm
  /** minimum minutes between two reminders for the same module */
  frequencyMinutes: number;
  modules: {
    tasks: boolean;
    nutrition: boolean;
    fitness: boolean;
    steps: boolean;
    study: boolean;
  };
}

export interface StreakRuleSettings {
  requireMandatoryTasks: boolean;
  requireCalorieRange: boolean;
  calorieRangeLowPct: number; // e.g. 85 => 85% of target
  calorieRangeHighPct: number; // e.g. 110
  requireProteinMinimum: boolean;
  proteinMinimumPct: number;
  requireSteps: boolean;
  requireWorkout: boolean;
  requireStudyMinutes: boolean;
  /** Days of week (0=Sun..6=Sat) that are planned rest days. */
  restDays: number[];
  /** Rest days count as a successful day rather than breaking the streak. */
  restDaysCountAsSuccess: boolean;
}

export interface Settings extends BaseRecord {
  id: 'settings';
  displayName: string;
  timeZone: string;
  weekStart: WeekStart;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  paceUnit: 'min/km' | 'min/mi';
  expenditureMethod: ExpenditureMethod;
  bodyWeightKg: number;
  themeMode: ThemeMode;
  reducedMotion: boolean;
  showDecorations: boolean;
  pageThemes: Record<PageKey, PageTheme>;
  reminders: ReminderSettings;
  streakRules: StreakRuleSettings;
  trackWater: boolean;
  trackBodyWeight: boolean;
  pinEnabled: boolean;
  /** Non-secret obfuscated check value for the *visual* PIN lock. Not encryption. */
  pinHash: string | null;
  autoLockMinutes: number;
  lastExportAt: ISOInstant | null;
  lastSyncAt: ISOInstant | null;
  demoDataLoaded: boolean;
  onboarded: boolean;
}

/* --------------------------------------------------------- versioned targets */

export interface TargetSet {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  water: number; // ml
  steps: number;
  studyMinutes: number;
  /** Baseline expenditure excluding logged exercise (Method A). */
  baselineExpenditure: number;
  /** Full TDEE already including usual activity (Method B). */
  tdee: number;
  weeklyWorkouts: number;
  weeklyRunKm: number;
}

/** A target revision that becomes effective on `effectiveFrom` (inclusive). */
export interface TargetVersion extends BaseRecord {
  effectiveFrom: ISODate;
  tz: string;
  targets: TargetSet;
  note?: string;
}

/* ------------------------------------------------------------------- tasks */

export type TaskStatus = 'pending' | 'completed' | 'skipped' | 'excused' | 'cancelled';
export type Priority = 'low' | 'medium' | 'high';
export type RecurrenceKind = 'none' | 'daily' | 'weekdays' | 'weekly' | 'interval';

export interface Recurrence {
  kind: RecurrenceKind;
  /** 0=Sun .. 6=Sat, used by `weekdays` and `weekly`. */
  daysOfWeek: number[];
  /** used by `interval` — every N days from startDate */
  intervalDays: number;
  startDate: ISODate;
  endDate: ISODate | null;
}

export interface TaskTemplate extends BaseRecord {
  title: string;
  description: string;
  category: string;
  dueTime: string | null; // HH:mm
  estimatedMinutes: number | null;
  priority: Priority;
  mandatory: boolean;
  notes: string;
  recurrence: Recurrence;
  archived: boolean;
  order: number;
  tz: string;
}

export interface TaskInstance extends DatedRecord {
  templateId: string | null;
  title: string;
  description: string;
  category: string;
  dueTime: string | null;
  estimatedMinutes: number | null;
  priority: Priority;
  mandatory: boolean;
  notes: string;
  status: TaskStatus;
  completedAt: ISOInstant | null;
  order: number;
  /** If this instance was carried forward, the date it was carried to. */
  carriedToDate: ISODate | null;
  /** If this instance is the result of a carry-forward, the original instance id. */
  carriedFromId: string | null;
}

/* --------------------------------------------------------------- nutrition */

export type NutritionMode = 'itemised' | 'quick';

export interface FoodEntry extends DatedRecord {
  meal: string;
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  time: string | null; // HH:mm
  notes: string;
}

export interface DayNutrition extends DatedRecord {
  mode: NutritionMode;
  /** Only meaningful when mode === 'quick'. */
  quickCalories: number;
  quickProtein: number;
  quickCarbs: number;
  quickFat: number;
  quickFibre: number;
  waterMl: number;
  bodyWeightKg: number | null;
}

/* ----------------------------------------------------------------- fitness */

export interface ExerciseSet {
  id: string;
  setNumber: number;
  reps: number;
  weight: number;
  unit: WeightUnit;
  rpe: number | null;
  restSeconds: number | null;
  notes: string;
}

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  sets: ExerciseSet[];
  notes: string;
}

export interface GymSession extends DatedRecord {
  name: string;
  time: string | null;
  durationMinutes: number;
  muscleGroups: string[];
  exercises: Exercise[];
  notes: string;
  /** Manual override wins over the MET estimate when not null. */
  manualCalories: number | null;
  met: number;
  /** Excluded from the active-calorie total to avoid double counting. */
  includedInOtherEstimate: boolean;
}

export interface WorkoutTemplate extends BaseRecord {
  name: string;
  muscleGroups: string[];
  exercises: { name: string; muscleGroup: string; sets: number; reps: number; weight: number; unit: WeightUnit }[];
  met: number;
  notes: string;
}

export type RunType = 'outdoor' | 'treadmill';

export interface RunSession extends DatedRecord {
  type: RunType;
  time: string | null;
  distanceKm: number;
  durationMinutes: number;
  inclinePct: number | null;
  avgHeartRate: number | null;
  notes: string;
  manualCalories: number | null;
  met: number;
  includedInOtherEstimate: boolean;
}

export interface StepEntry extends DatedRecord {
  steps: number;
  /** Steps are commonly already inside a TDEE / baseline figure. */
  includedInOtherEstimate: boolean;
  manualCalories: number | null;
  notes: string;
  source: 'manual' | 'import';
}

/* ------------------------------------------------------------------- study */

export interface Subject extends BaseRecord {
  name: string;
  colour: string;
  archived: boolean;
}

export interface Chapter extends BaseRecord {
  subjectId: string;
  name: string;
  completed: boolean;
  completedDate: ISODate | null;
  order: number;
}

export type StudyStatus = 'planned' | 'completed' | 'partial' | 'skipped';

export interface StudySession extends DatedRecord {
  subjectId: string;
  chapterId: string | null;
  topic: string;
  plannedMinutes: number;
  actualMinutes: number;
  startTime: string | null;
  endTime: string | null;
  status: StudyStatus;
  confidence: number | null; // 1..5
  revisionDate: ISODate | null;
  notes: string;
}

/** Persisted timer state so elapsed time survives backgrounding / reloads. */
export interface StudyTimer extends BaseRecord {
  id: 'study-timer';
  active: boolean;
  subjectId: string | null;
  chapterId: string | null;
  topic: string;
  startedAt: ISOInstant | null;
  /** Milliseconds accumulated before the current running span. */
  accumulatedMs: number;
  running: boolean;
}

/* -------------------------------------------------------------- day record */

export interface DayNote extends DatedRecord {
  note: string;
  mood: number | null; // 1..5
  energy: number | null; // 1..5
  restDay: boolean;
  excused: boolean;
}

/** Cached, always-recomputable summary. Never the source of truth. */
export interface DaySummaryCache extends DatedRecord {
  /** Hash of the inputs used; a mismatch invalidates the cache. */
  inputHash: string;
  payload: unknown;
}

export type StoreName =
  | 'settings'
  | 'targetVersions'
  | 'taskTemplates'
  | 'taskInstances'
  | 'foodEntries'
  | 'dayNutrition'
  | 'gymSessions'
  | 'workoutTemplates'
  | 'runSessions'
  | 'stepEntries'
  | 'subjects'
  | 'chapters'
  | 'studySessions'
  | 'studyTimer'
  | 'dayNotes'
  | 'daySummaries';
