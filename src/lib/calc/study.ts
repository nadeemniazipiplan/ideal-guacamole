import type { Chapter, ISODate, StudySession, StudyTimer, Subject } from '../../types/models';
import { round } from '../validate';

export interface StudyTotals {
  minutes: number;
  sessions: number;
  plannedMinutes: number;
  completedSessions: number;
  averageConfidence: number | null;
}

export function studyTotals(sessions: StudySession[]): StudyTotals {
  const minutes = sessions.reduce((sum, s) => sum + s.actualMinutes, 0);
  const plannedMinutes = sessions.reduce((sum, s) => sum + s.plannedMinutes, 0);
  const rated = sessions.filter((s) => s.confidence !== null);
  return {
    minutes: round(minutes, 0),
    sessions: sessions.length,
    plannedMinutes: round(plannedMinutes, 0),
    completedSessions: sessions.filter((s) => s.status === 'completed').length,
    averageConfidence:
      rated.length === 0 ? null : round(rated.reduce((sum, s) => sum + (s.confidence ?? 0), 0) / rated.length, 2),
  };
}

export interface SubjectDistribution {
  subjectId: string;
  name: string;
  colour: string;
  minutes: number;
  percent: number;
  sessions: number;
}

export function subjectDistribution(sessions: StudySession[], subjects: Subject[]): SubjectDistribution[] {
  const totalMinutes = sessions.reduce((sum, s) => sum + s.actualMinutes, 0);
  const byId = new Map<string, { minutes: number; sessions: number }>();
  for (const session of sessions) {
    const bucket = byId.get(session.subjectId) ?? { minutes: 0, sessions: 0 };
    bucket.minutes += session.actualMinutes;
    bucket.sessions += 1;
    byId.set(session.subjectId, bucket);
  }
  return [...byId.entries()]
    .map(([subjectId, bucket]) => {
      const subject = subjects.find((s) => s.id === subjectId);
      return {
        subjectId,
        name: subject?.name ?? 'Removed subject',
        colour: subject?.colour ?? '#94A3B8',
        minutes: round(bucket.minutes, 0),
        sessions: bucket.sessions,
        percent: totalMinutes === 0 ? 0 : round((bucket.minutes / totalMinutes) * 100, 1),
      };
    })
    .sort((a, b) => b.minutes - a.minutes);
}

export interface SubjectProgress {
  subjectId: string;
  name: string;
  colour: string;
  totalChapters: number;
  completedChapters: number;
  percent: number;
}

export function subjectProgress(subjects: Subject[], chapters: Chapter[]): SubjectProgress[] {
  return subjects
    .filter((subject) => !subject.archived)
    .map((subject) => {
      const own = chapters.filter((c) => c.subjectId === subject.id);
      const completed = own.filter((c) => c.completed).length;
      return {
        subjectId: subject.id,
        name: subject.name,
        colour: subject.colour,
        totalChapters: own.length,
        completedChapters: completed,
        percent: own.length === 0 ? 0 : round((completed / own.length) * 100, 1),
      };
    })
    .sort((a, b) => b.percent - a.percent);
}

export interface WeeklyStudyAnalysis {
  /** Days in the range that have already happened. */
  elapsedDays: number;
  totalMinutes: number;
  averageDailyMinutes: number;
  targetMinutes: number;
  adherencePct: number;
  completedChapters: number;
  strongestDay: { date: ISODate; minutes: number } | null;
  byDay: { date: ISODate; minutes: number }[];
  distribution: SubjectDistribution[];
}

/**
 * `today` bounds the target and the averages: a week still in progress is not
 * measured against days that have not happened.
 */
export function weeklyStudyAnalysis(
  sessionsByDate: Map<ISODate, StudySession[]>,
  dates: ISODate[],
  subjects: Subject[],
  chapters: Chapter[],
  dailyTargetForDate: (date: ISODate) => number,
  today: ISODate,
): WeeklyStudyAnalysis {
  const byDay = dates.map((date) => ({
    date,
    minutes: round((sessionsByDate.get(date) ?? []).reduce((sum, s) => sum + s.actualMinutes, 0), 0),
  }));
  const elapsed = dates.filter((date) => date <= today);
  const totalMinutes = byDay.reduce((sum, day) => sum + day.minutes, 0);
  const targetMinutes = elapsed.reduce((sum, date) => sum + dailyTargetForDate(date), 0);
  const all = dates.flatMap((date) => sessionsByDate.get(date) ?? []);
  const completedChapters = chapters.filter(
    (chapter) => chapter.completed && chapter.completedDate !== null && dates.includes(chapter.completedDate),
  ).length;
  const strongest = byDay.filter((d) => d.minutes > 0).sort((a, b) => b.minutes - a.minutes)[0] ?? null;

  return {
    elapsedDays: elapsed.length,
    totalMinutes,
    averageDailyMinutes: elapsed.length === 0 ? 0 : round(totalMinutes / elapsed.length, 1),
    targetMinutes,
    adherencePct: targetMinutes === 0 ? 0 : round((totalMinutes / targetMinutes) * 100, 1),
    completedChapters,
    strongestDay: strongest,
    byDay,
    distribution: subjectDistribution(all, subjects),
  };
}

/**
 * Elapsed timer time is derived from stored timestamps, so backgrounding the
 * app, locking the iPad, or reloading the page never loses or invents time.
 */
export function timerElapsedMs(timer: StudyTimer, now: number = Date.now()): number {
  if (!timer.active) return 0;
  if (!timer.running || !timer.startedAt) return Math.max(0, timer.accumulatedMs);
  const started = Date.parse(timer.startedAt);
  if (!Number.isFinite(started)) return Math.max(0, timer.accumulatedMs);
  return Math.max(0, timer.accumulatedMs + Math.max(0, now - started));
}

export function formatStopwatch(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
