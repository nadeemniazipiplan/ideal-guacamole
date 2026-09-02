import type { DataSnapshot } from '../db/repo';
import type {
  DayNote,
  DayNutrition,
  FoodEntry,
  GymSession,
  ISODate,
  RunSession,
  StepEntry,
  StudySession,
  TaskInstance,
} from '../types/models';

function groupByDate<T extends { date: ISODate }>(records: T[]): Map<ISODate, T[]> {
  const map = new Map<ISODate, T[]>();
  for (const record of records) {
    const list = map.get(record.date);
    if (list) list.push(record);
    else map.set(record.date, [record]);
  }
  return map;
}

function keyByDate<T extends { date: ISODate }>(records: T[]): Map<ISODate, T> {
  const map = new Map<ISODate, T>();
  for (const record of records) map.set(record.date, record);
  return map;
}

/** Date-keyed views over the in-memory snapshot; rebuilt whenever data changes. */
export interface DataIndex {
  tasks: Map<ISODate, TaskInstance[]>;
  food: Map<ISODate, FoodEntry[]>;
  nutrition: Map<ISODate, DayNutrition>;
  gym: Map<ISODate, GymSession[]>;
  runs: Map<ISODate, RunSession[]>;
  steps: Map<ISODate, StepEntry>;
  study: Map<ISODate, StudySession[]>;
  notes: Map<ISODate, DayNote>;
}

export function buildIndex(snapshot: DataSnapshot): DataIndex {
  return {
    tasks: groupByDate(snapshot.taskInstances),
    food: groupByDate(snapshot.foodEntries),
    nutrition: keyByDate(snapshot.dayNutrition),
    gym: groupByDate(snapshot.gymSessions),
    runs: groupByDate(snapshot.runSessions),
    steps: keyByDate(snapshot.stepEntries),
    study: groupByDate(snapshot.studySessions),
    notes: keyByDate(snapshot.dayNotes),
  };
}

/** The earliest date that carries any record at all. */
export function firstRecordedDate(snapshot: DataSnapshot): ISODate | null {
  const dates: ISODate[] = [
    ...snapshot.taskInstances.map((r) => r.date),
    ...snapshot.foodEntries.map((r) => r.date),
    ...snapshot.dayNutrition.map((r) => r.date),
    ...snapshot.gymSessions.map((r) => r.date),
    ...snapshot.runSessions.map((r) => r.date),
    ...snapshot.stepEntries.map((r) => r.date),
    ...snapshot.studySessions.map((r) => r.date),
    ...snapshot.dayNotes.map((r) => r.date),
  ];
  if (dates.length === 0) return null;
  return dates.reduce((min, date) => (date < min ? date : min), dates[0]);
}
