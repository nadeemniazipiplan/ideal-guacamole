import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { DataSnapshot } from '../db/repo';
import {
  clearAllData,
  deleteRecord,
  deleteRecords,
  loadSnapshot,
  replaceCollections,
  saveRecord,
  saveRecords,
} from '../db/repo';
import { createDefaultSettings, createEmptyTimer } from '../db/defaults';
import { buildIndex, firstRecordedDate } from '../lib/dataIndex';
import type { DataIndex } from '../lib/dataIndex';
import { addDays, endOfMonth, nowInstant, startOfMonth, todayISO } from '../lib/date';
import { materialiseInstances } from '../lib/recurrence';
import { buildDaySummary } from '../lib/daySummary';
import type { DaySummary } from '../lib/daySummary';
import { RECORD_SCHEMA_VERSION } from '../types/models';
import type {
  Chapter,
  DayNote,
  DayNutrition,
  FoodEntry,
  GymSession,
  ISODate,
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

/* --------------------------------------------------------------- utilities */

type CollectionKey =
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
  | 'dayNotes';

type CollectionRecord = DataSnapshot[CollectionKey][number];

export interface UndoEntry {
  label: string;
  run: () => Promise<void>;
}

export interface ToastMessage {
  id: string;
  text: string;
  tone: 'info' | 'success' | 'warning' | 'error';
  undo?: UndoEntry;
}

export interface AppContextValue {
  ready: boolean;
  error: string | null;
  data: DataSnapshot;
  index: DataIndex;
  settings: Settings;
  today: ISODate;
  selectedDate: ISODate;
  firstDate: ISODate | null;
  saving: boolean;
  savedAt: number | null;
  toasts: ToastMessage[];
  setSelectedDate: (date: ISODate) => void;
  summaryFor: (date: ISODate) => DaySummary;
  notify: (text: string, tone?: ToastMessage['tone'], undo?: UndoEntry) => void;
  dismissToast: (id: string) => void;
  reload: () => Promise<void>;
  actions: Actions;
}

export interface Actions {
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  putRecord: <K extends CollectionKey>(key: K, record: DataSnapshot[K][number]) => Promise<void>;
  putRecords: <K extends CollectionKey>(key: K, records: DataSnapshot[K][number][]) => Promise<void>;
  removeRecord: <K extends CollectionKey>(key: K, id: string, label?: string) => Promise<void>;
  removeRecordsBulk: <K extends CollectionKey>(key: K, ids: string[], label?: string) => Promise<void>;
  saveTimer: (timer: StudyTimer) => Promise<void>;
  ensureInstancesFor: (dates: ISODate[]) => Promise<void>;
  resetEverything: () => Promise<void>;
  importSnapshot: (
    payload: Partial<Record<StoreName, unknown[]>>,
    mode: 'merge' | 'replace',
  ) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Placeholder used only while the database is still opening. */
function emptySnapshot(): DataSnapshot {
  return {
    settings: createDefaultSettings(),
    targetVersions: [],
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

/* ------------------------------------------------------------------ provider */

export function AppProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [data, setData] = useState<DataSnapshot>(emptySnapshot);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [today, setToday] = useState<ISODate>(() => todayISO('Asia/Karachi'));
  const [selectedDate, setSelectedDateState] = useState<ISODate>(today);
  const dateTouched = useRef(false);
  const materialising = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  const reload = useCallback(async () => {
    try {
      const snapshot = await loadSnapshot();
      setData(snapshot);
      const currentDay = todayISO(snapshot.settings.timeZone);
      setToday(currentDay);
      if (!dateTouched.current) setSelectedDateState(currentDay);
      setReady(true);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'The local database could not be opened. Private browsing modes sometimes block storage.',
      );
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const notify = useCallback((text: string, tone: ToastMessage['tone'] = 'info', undo?: UndoEntry) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current.slice(-2), { id, text, tone, undo }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, undo ? 9000 : 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const markSaved = useCallback(() => {
    setSaving(false);
    setSavedAt(Date.now());
  }, []);

  /* ------------------------------------------------------------ persistence */

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      setSaving(true);
      const settings = {
        ...data.settings,
        ...patch,
        id: 'settings' as const,
        updatedAt: nowInstant(),
        v: RECORD_SCHEMA_VERSION,
      } as Settings;
      const stored = await saveRecord<Settings>('settings', settings);
      setData((current) => ({ ...current, settings: stored }));
      if (patch.timeZone) setToday(todayISO(stored.timeZone));
      markSaved();
    },
    [data, markSaved],
  );

  const putRecord = useCallback(
    async <K extends CollectionKey>(key: K, record: DataSnapshot[K][number]) => {
      setSaving(true);
      const stored = await saveRecord(key as StoreName, record as CollectionRecord);
      setData((current) => {
        const list = current[key] as CollectionRecord[];
        const index = list.findIndex((item) => item.id === stored.id);
        const nextList = index === -1 ? [...list, stored] : list.map((item) => (item.id === stored.id ? stored : item));
        return { ...current, [key]: nextList } as DataSnapshot;
      });
      markSaved();
    },
    [markSaved],
  );

  const putRecords = useCallback(
    async <K extends CollectionKey>(key: K, records: DataSnapshot[K][number][]) => {
      if (records.length === 0) return;
      setSaving(true);
      const stored = await saveRecords(key as StoreName, records as CollectionRecord[]);
      setData((current) => {
        const list = current[key] as CollectionRecord[];
        const byId = new Map(list.map((item) => [item.id, item]));
        for (const record of stored) byId.set(record.id, record);
        return { ...current, [key]: [...byId.values()] } as DataSnapshot;
      });
      markSaved();
    },
    [markSaved],
  );

  const removeRecord = useCallback(
    async <K extends CollectionKey>(key: K, id: string, label?: string) => {
      const list = data[key] as CollectionRecord[];
      const existing = list.find((item) => item.id === id);
      setSaving(true);
      await deleteRecord(key as StoreName, id);
      setData((current) => ({
        ...current,
        [key]: (current[key] as CollectionRecord[]).filter((item) => item.id !== id),
      }) as DataSnapshot);
      markSaved();
      if (existing && label) {
        notify(`${label} deleted.`, 'info', {
          label: 'Undo',
          run: async () => {
            await saveRecord(key as StoreName, existing);
            setData((current) => ({
              ...current,
              [key]: [...(current[key] as CollectionRecord[]), existing],
            }) as DataSnapshot);
          },
        });
      }
    },
    [data, markSaved, notify],
  );

  const removeRecordsBulk = useCallback(
    async <K extends CollectionKey>(key: K, ids: string[], label?: string) => {
      if (ids.length === 0) return;
      const list = data[key] as CollectionRecord[];
      const existing = list.filter((item) => ids.includes(item.id));
      setSaving(true);
      await deleteRecords(key as StoreName, ids);
      setData((current) => ({
        ...current,
        [key]: (current[key] as CollectionRecord[]).filter((item) => !ids.includes(item.id)),
      }) as DataSnapshot);
      markSaved();
      if (label) {
        notify(`${label} (${ids.length}) deleted.`, 'info', {
          label: 'Undo',
          run: async () => {
            await saveRecords(key as StoreName, existing);
            setData((current) => ({
              ...current,
              [key]: [...(current[key] as CollectionRecord[]), ...existing],
            }) as DataSnapshot);
          },
        });
      }
    },
    [data, markSaved, notify],
  );

  const saveTimer = useCallback(
    async (timer: StudyTimer) => {
      const stored = await saveRecord<StudyTimer>('studyTimer', timer);
      setData((current) => ({ ...current, studyTimer: stored }));
    },
    [],
  );

  const ensureInstancesFor = useCallback(
    async (dates: ISODate[]) => {
      if (materialising.current) return;
      // Read the latest snapshot from the ref, not from a closed-over render
      // value, so a write that landed a moment ago is taken into account.
      const latest = dataRef.current;
      const created = materialiseInstances(latest.taskTemplates, latest.taskInstances, dates, latest.settings.timeZone);
      if (created.length === 0) return;
      materialising.current = true;
      try {
        const stored = await saveRecords<TaskInstance>('taskInstances', created);
        setData((current) => {
          const byId = new Map(current.taskInstances.map((instance) => [instance.id, instance]));
          for (const instance of stored) {
            // A template instance has a deterministic id, so an existing record
            // for that day always wins over a freshly generated blank one.
            if (!byId.has(instance.id)) byId.set(instance.id, instance);
          }
          return { ...current, taskInstances: [...byId.values()] };
        });
      } finally {
        materialising.current = false;
      }
    },
    [],
  );

  const resetEverything = useCallback(async () => {
    await clearAllData();
    await reload();
  }, [reload]);

  const importSnapshot = useCallback(
    async (payload: Partial<Record<StoreName, unknown[]>>, mode: 'merge' | 'replace') => {
      setSaving(true);
      if (mode === 'replace') {
        await replaceCollections(payload as Partial<Record<StoreName, { id: string }[]>>);
      } else {
        for (const [store, records] of Object.entries(payload)) {
          if (!records || records.length === 0) continue;
          await saveRecords(store as StoreName, records as { id: string }[]);
        }
      }
      await reload();
      markSaved();
    },
    [markSaved, reload],
  );

  /* ------------------------------------------------------------- day rollover */

  useEffect(() => {
    const tick = () => {
      const current = todayISO(data.settings.timeZone);
      setToday((previous) => {
        if (previous === current) return previous;
        // Crossing midnight moves the *default* view forward without touching
        // any stored record for the previous day.
        if (!dateTouched.current) setSelectedDateState(current);
        return current;
      });
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    const onVisible = () => tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [data]);

  /* ------------------------------------------- recurring instance generation */

  useEffect(() => {
    if (!ready) return;
    const window14 = [] as ISODate[];
    for (let offset = -14; offset <= 30; offset += 1) window14.push(addDays(today, offset));
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);
    for (let cursor = monthStart; cursor <= monthEnd; cursor = addDays(cursor, 1)) {
      if (!window14.includes(cursor)) window14.push(cursor);
    }
    void ensureInstancesFor(window14);
  }, [ready, data, today, selectedDate, ensureInstancesFor]);

  /* ------------------------------------------------------------------ derived */

  const index = useMemo<DataIndex>(() => buildIndex(data), [data]);

  const summaryFor = useCallback(
    (date: ISODate) => buildDaySummary(date, index, data.settings, data.targetVersions, today),
    [index, data, today],
  );

  const setSelectedDate = useCallback((date: ISODate) => {
    dateTouched.current = true;
    setSelectedDateState(date);
  }, []);

  const actions = useMemo<Actions>(
    () => ({
      updateSettings,
      putRecord,
      putRecords,
      removeRecord,
      removeRecordsBulk,
      saveTimer,
      ensureInstancesFor,
      resetEverything,
      importSnapshot,
    }),
    [
      updateSettings, putRecord, putRecords, removeRecord, removeRecordsBulk,
      saveTimer, ensureInstancesFor, resetEverything, importSnapshot,
    ],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      error,
      data,
      index,
      settings: data.settings,
      today,
      selectedDate,
      firstDate: firstRecordedDate(data),
      saving,
      savedAt,
      toasts,
      setSelectedDate,
      summaryFor,
      notify,
      dismissToast,
      reload,
      actions,
    }),
    [
      ready, error, data, index, today, selectedDate, saving, savedAt, toasts,
      setSelectedDate, summaryFor, notify, dismissToast, reload, actions,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside <AppProvider>.');
  return context;
}

/** Typed helpers used across pages. */
export type {
  Chapter, DayNote, DayNutrition, FoodEntry, GymSession, RunSession, StepEntry,
  StudySession, Subject, TargetVersion, TaskInstance, TaskTemplate, WorkoutTemplate,
};
