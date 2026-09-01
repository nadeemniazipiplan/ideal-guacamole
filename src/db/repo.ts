import { clearStore, getAll, getOne, put, putMany, remove, removeMany } from './idb';
import { getDb } from './schema';
import { createDefaultSettings, createEmptyTimer, createInitialTargetVersion } from './defaults';
import { DEFAULT_TZ, nowInstant, todayISO } from '../lib/date';
import { RECORD_SCHEMA_VERSION } from '../types/models';
import type {
  Chapter,
  DayNote,
  DayNutrition,
  FoodEntry,
  GymSession,
  RunSession,
  Settings,
  StepEntry,
  StoreName,
  StudySession,
  StudyTimer,
  Subject,
  TargetVersion,
  TaskInstance,
  TaskTemplate,
  WorkoutTemplate,
} from '../types/models';

/** Everything the UI needs, held in memory and mirrored to IndexedDB. */
export interface DataSnapshot {
  settings: Settings;
  targetVersions: TargetVersion[];
  taskTemplates: TaskTemplate[];
  taskInstances: TaskInstance[];
  foodEntries: FoodEntry[];
  dayNutrition: DayNutrition[];
  gymSessions: GymSession[];
  workoutTemplates: WorkoutTemplate[];
  runSessions: RunSession[];
  stepEntries: StepEntry[];
  subjects: Subject[];
  chapters: Chapter[];
  studySessions: StudySession[];
  studyTimer: StudyTimer;
  dayNotes: DayNote[];
}

export const COLLECTION_STORES: Exclude<StoreName, 'settings' | 'studyTimer' | 'daySummaries'>[] = [
  'targetVersions',
  'taskTemplates',
  'taskInstances',
  'foodEntries',
  'dayNutrition',
  'gymSessions',
  'workoutTemplates',
  'runSessions',
  'stepEntries',
  'subjects',
  'chapters',
  'studySessions',
  'dayNotes',
];

function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

/** Reads the whole database, creating first-run defaults when it is empty. */
export async function loadSnapshot(): Promise<DataSnapshot> {
  const db = await getDb();

  let settings = await getOne<Settings>(db, 'settings', 'settings');
  if (!settings) {
    // First run: keep the documented default time zone, but respect the device
    // zone when it is a sensible one the user is likely to want.
    const detected = detectTimeZone();
    settings = createDefaultSettings(detected === 'UTC' ? DEFAULT_TZ : detected);
    await put(db, 'settings', settings);
  }

  let targetVersions = await getAll<TargetVersion>(db, 'targetVersions');
  if (targetVersions.length === 0) {
    const initial = createInitialTargetVersion(settings.timeZone, todayISO(settings.timeZone));
    await put(db, 'targetVersions', initial);
    targetVersions = [initial];
  }

  let studyTimer = await getOne<StudyTimer>(db, 'studyTimer', 'study-timer');
  if (!studyTimer) {
    studyTimer = createEmptyTimer();
    await put(db, 'studyTimer', studyTimer);
  }

  const [
    taskTemplates,
    taskInstances,
    foodEntries,
    dayNutrition,
    gymSessions,
    workoutTemplates,
    runSessions,
    stepEntries,
    subjects,
    chapters,
    studySessions,
    dayNotes,
  ] = await Promise.all([
    getAll<TaskTemplate>(db, 'taskTemplates'),
    getAll<TaskInstance>(db, 'taskInstances'),
    getAll<FoodEntry>(db, 'foodEntries'),
    getAll<DayNutrition>(db, 'dayNutrition'),
    getAll<GymSession>(db, 'gymSessions'),
    getAll<WorkoutTemplate>(db, 'workoutTemplates'),
    getAll<RunSession>(db, 'runSessions'),
    getAll<StepEntry>(db, 'stepEntries'),
    getAll<Subject>(db, 'subjects'),
    getAll<Chapter>(db, 'chapters'),
    getAll<StudySession>(db, 'studySessions'),
    getAll<DayNote>(db, 'dayNotes'),
  ]);

  return {
    settings,
    targetVersions,
    taskTemplates,
    taskInstances,
    foodEntries,
    dayNutrition,
    gymSessions,
    workoutTemplates,
    runSessions,
    stepEntries,
    subjects,
    chapters,
    studySessions,
    studyTimer,
    dayNotes,
  };
}

export async function saveRecord<T extends { id: string }>(store: StoreName, record: T): Promise<T> {
  const db = await getDb();
  const stamped = { ...record, updatedAt: nowInstant(), v: RECORD_SCHEMA_VERSION } as T;
  await put(db, store, stamped);
  return stamped;
}

export async function saveRecords<T extends { id: string }>(store: StoreName, records: T[]): Promise<T[]> {
  const db = await getDb();
  const now = nowInstant();
  const stamped = records.map((record) => ({ ...record, updatedAt: now, v: RECORD_SCHEMA_VERSION }) as T);
  await putMany(db, store, stamped);
  return stamped;
}

export async function deleteRecord(store: StoreName, id: string): Promise<void> {
  const db = await getDb();
  await remove(db, store, id);
}

export async function deleteRecords(store: StoreName, ids: string[]): Promise<void> {
  const db = await getDb();
  await removeMany(db, store, ids);
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  for (const store of [...COLLECTION_STORES, 'daySummaries' as StoreName]) {
    await clearStore(db, store);
  }
}

/** Replaces every collection store in one go (used by "replace" imports). */
export async function replaceCollections(data: Partial<Record<StoreName, { id: string }[]>>): Promise<void> {
  const db = await getDb();
  for (const store of COLLECTION_STORES) {
    const records = data[store];
    if (!records) continue;
    await clearStore(db, store);
    await putMany(db, store, records);
  }
}
