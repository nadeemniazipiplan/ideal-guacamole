import type { Exercise, GymSession, RunSession, StepEntry, WeightUnit } from '../../types/models';
import { round } from '../validate';

export const KG_PER_LB = 0.45359237;
export const KM_PER_MI = 1.609344;

export function toKg(weight: number, unit: WeightUnit): number {
  return unit === 'kg' ? weight : weight * KG_PER_LB;
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

export function kmToMi(km: number): number {
  return km / KM_PER_MI;
}

/** Training volume in kg: sets x reps x load, normalised to kilograms. */
export function exerciseVolume(exercise: Exercise): number {
  return round(
    exercise.sets.reduce((sum, set) => sum + set.reps * toKg(set.weight, set.unit), 0),
    1,
  );
}

export function sessionVolume(session: GymSession): number {
  return round(session.exercises.reduce((sum, exercise) => sum + exerciseVolume(exercise), 0), 1);
}

export function sessionSetCount(session: GymSession): number {
  return session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
}

/**
 * MET estimate:  kcal = MET x 3.5 x bodyWeightKg / 200 x minutes
 * Always labelled as an estimate in the UI.
 */
export function metCalories(met: number, bodyWeightKg: number, minutes: number): number {
  if (met <= 0 || bodyWeightKg <= 0 || minutes <= 0) return 0;
  return round((met * 3.5 * bodyWeightKg) / 200 * minutes, 0);
}

/** Manual entry always wins over the MET estimate. */
export function sessionCalories(
  session: { manualCalories: number | null; met: number; durationMinutes: number },
  bodyWeightKg: number,
): number {
  if (session.manualCalories !== null) return round(session.manualCalories, 0);
  return metCalories(session.met, bodyWeightKg, session.durationMinutes);
}

export function runCalories(run: RunSession, bodyWeightKg: number): number {
  if (run.manualCalories !== null) return round(run.manualCalories, 0);
  return metCalories(run.met, bodyWeightKg, run.durationMinutes);
}

/** Rough walking estimate; only used when the user has not entered a value. */
export function stepCalories(entry: StepEntry, bodyWeightKg: number): number {
  if (entry.manualCalories !== null) return round(entry.manualCalories, 0);
  if (entry.steps <= 0 || bodyWeightKg <= 0) return 0;
  // ~0.0005 kcal per step per kg of body weight (moderate walking cadence).
  return round(entry.steps * 0.0005 * bodyWeightKg, 0);
}

export interface ActiveCalorieBreakdown {
  gym: number;
  running: number;
  steps: number;
  total: number;
  excluded: number;
}

/**
 * Sums only entries that are NOT marked "already included in another estimate",
 * so a run logged inside a gym session (or steps inside a TDEE) is never
 * double-counted.
 */
export function activeCalories(
  gymSessions: GymSession[],
  runs: RunSession[],
  steps: StepEntry[],
  bodyWeightKg: number,
): ActiveCalorieBreakdown {
  let excluded = 0;
  let gym = 0;
  for (const session of gymSessions) {
    const kcal = sessionCalories(session, bodyWeightKg);
    if (session.includedInOtherEstimate) excluded += kcal;
    else gym += kcal;
  }
  let running = 0;
  for (const run of runs) {
    const kcal = runCalories(run, bodyWeightKg);
    if (run.includedInOtherEstimate) excluded += kcal;
    else running += kcal;
  }
  let stepKcal = 0;
  for (const entry of steps) {
    const kcal = stepCalories(entry, bodyWeightKg);
    if (entry.includedInOtherEstimate) excluded += kcal;
    else stepKcal += kcal;
  }
  return {
    gym: round(gym, 0),
    running: round(running, 0),
    steps: round(stepKcal, 0),
    total: round(gym + running + stepKcal, 0),
    excluded: round(excluded, 0),
  };
}

/** Average pace in minutes per kilometre. */
export function paceMinPerKm(distanceKm: number, durationMinutes: number): number | null {
  if (distanceKm <= 0 || durationMinutes <= 0) return null;
  return round(durationMinutes / distanceKm, 3);
}

/** Average speed in kilometres per hour. */
export function speedKmh(distanceKm: number, durationMinutes: number): number | null {
  if (distanceKm <= 0 || durationMinutes <= 0) return null;
  return round(distanceKm / (durationMinutes / 60), 2);
}

/** "5:30 /km" style label. */
export function formatPace(distanceKm: number, durationMinutes: number, unit: 'min/km' | 'min/mi'): string {
  const perKm = paceMinPerKm(distanceKm, durationMinutes);
  if (perKm === null) return '--';
  const value = unit === 'min/km' ? perKm : perKm * KM_PER_MI;
  const minutes = Math.floor(value);
  const seconds = Math.round((value - minutes) * 60);
  const normalisedMinutes = seconds === 60 ? minutes + 1 : minutes;
  const normalisedSeconds = seconds === 60 ? 0 : seconds;
  return `${normalisedMinutes}:${String(normalisedSeconds).padStart(2, '0')} ${unit === 'min/km' ? '/km' : '/mi'}`;
}

export function formatSpeed(distanceKm: number, durationMinutes: number, unit: 'km' | 'mi'): string {
  const kmh = speedKmh(distanceKm, durationMinutes);
  if (kmh === null) return '--';
  return unit === 'km' ? `${round(kmh, 2)} km/h` : `${round(kmh / KM_PER_MI, 2)} mph`;
}

export interface PersonalRecord {
  exercise: string;
  bestWeightKg: number;
  bestReps: number;
  bestVolumeKg: number;
  sessions: number;
  lastDate: string;
}

export function personalRecords(sessions: GymSession[]): PersonalRecord[] {
  const map = new Map<string, PersonalRecord>();
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      const key = exercise.name.trim().toLowerCase();
      if (!key) continue;
      const record = map.get(key) ?? {
        exercise: exercise.name.trim(),
        bestWeightKg: 0,
        bestReps: 0,
        bestVolumeKg: 0,
        sessions: 0,
        lastDate: session.date,
      };
      record.sessions += 1;
      if (session.date > record.lastDate) record.lastDate = session.date;
      for (const set of exercise.sets) {
        record.bestWeightKg = Math.max(record.bestWeightKg, round(toKg(set.weight, set.unit), 1));
        record.bestReps = Math.max(record.bestReps, set.reps);
      }
      record.bestVolumeKg = Math.max(record.bestVolumeKg, exerciseVolume(exercise));
      map.set(key, record);
    }
  }
  return [...map.values()].sort((a, b) => b.bestVolumeKg - a.bestVolumeKg);
}

/** The most recent performance of an exercise before `beforeDate`. */
export function previousPerformance(
  sessions: GymSession[],
  exerciseName: string,
  beforeDate: string,
): { date: string; exercise: Exercise } | null {
  const key = exerciseName.trim().toLowerCase();
  if (!key) return null;
  const candidates = sessions
    .filter((session) => session.date < beforeDate)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const session of candidates) {
    const exercise = session.exercises.find((e) => e.name.trim().toLowerCase() === key);
    if (exercise) return { date: session.date, exercise };
  }
  return null;
}
