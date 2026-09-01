import type { DataSnapshot } from '../db/repo';
import type { ISODate } from '../types/models';
import { exerciseVolume, formatPace, runCalories, sessionCalories, sessionVolume, stepCalories } from './calc/fitness';
import { round } from './validate';

/** RFC-4180 escaping. A leading =, +, - or @ is prefixed so spreadsheets do not evaluate it. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(cell).join(','), ...rows.map((row) => row.map(cell).join(','))].join('\r\n');
}

export type CsvModule = 'tasks' | 'nutrition' | 'gym' | 'running' | 'steps' | 'study' | 'daily';

function inRange(date: ISODate, from: ISODate, to: ISODate): boolean {
  return date >= from && date <= to;
}

export function buildCsv(
  module: CsvModule,
  data: DataSnapshot,
  from: ISODate,
  to: ISODate,
  dailyRows?: unknown[][],
): { filename: string; content: string } {
  const stamp = `${from}_to_${to}`;
  const bodyWeightKg = data.settings.bodyWeightKg;
  switch (module) {
    case 'tasks':
      return {
        filename: `tasks_${stamp}.csv`,
        content: toCsv(
          ['date', 'title', 'category', 'priority', 'mandatory', 'status', 'dueTime', 'estimatedMinutes', 'completedAt', 'notes'],
          data.taskInstances
            .filter((task) => inRange(task.date, from, to))
            .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
            .map((task) => [
              task.date, task.title, task.category, task.priority, task.mandatory ? 'yes' : 'no',
              task.status, task.dueTime ?? '', task.estimatedMinutes ?? '', task.completedAt ?? '', task.notes,
            ]),
        ),
      };
    case 'nutrition': {
      const rows: unknown[][] = [];
      for (const entry of data.foodEntries.filter((item) => inRange(item.date, from, to))) {
        rows.push(['itemised', entry.date, entry.meal, entry.name, entry.quantity, entry.calories, entry.protein, entry.carbs, entry.fat, entry.fibre, entry.time ?? '', entry.notes]);
      }
      for (const day of data.dayNutrition.filter((item) => inRange(item.date, from, to) && item.mode === 'quick')) {
        rows.push(['quick total', day.date, '', 'Whole day', '', day.quickCalories, day.quickProtein, day.quickCarbs, day.quickFat, day.quickFibre, '', '']);
      }
      rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])));
      return {
        filename: `nutrition_${stamp}.csv`,
        content: toCsv(['mode', 'date', 'meal', 'name', 'quantity', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'time', 'notes'], rows),
      };
    }
    case 'gym': {
      const rows: unknown[][] = [];
      for (const session of data.gymSessions.filter((item) => inRange(item.date, from, to)).sort((a, b) => a.date.localeCompare(b.date))) {
        for (const exercise of session.exercises) {
          for (const set of exercise.sets) {
            rows.push([
              session.date, session.name, session.time ?? '', session.durationMinutes, exercise.muscleGroup, exercise.name,
              set.setNumber, set.reps, set.weight, set.unit, set.rpe ?? '', set.restSeconds ?? '',
              round(exerciseVolume(exercise), 1), round(sessionVolume(session), 1), sessionCalories(session, bodyWeightKg), session.includedInOtherEstimate ? 'yes' : 'no',
            ]);
          }
        }
      }
      return {
        filename: `gym_${stamp}.csv`,
        content: toCsv(
          ['date', 'workout', 'time', 'durationMinutes', 'muscleGroup', 'exercise', 'set', 'reps', 'load', 'unit', 'rpe', 'restSeconds', 'exerciseVolumeKg', 'sessionVolumeKg', 'estimatedCalories', 'excludedFromActiveCalories'],
          rows,
        ),
      };
    }
    case 'running':
      return {
        filename: `running_${stamp}.csv`,
        content: toCsv(
          ['date', 'type', 'time', 'distanceKm', 'durationMinutes', 'paceMinPerKm', 'inclinePct', 'avgHeartRate', 'estimatedCalories', 'excludedFromActiveCalories', 'notes'],
          data.runSessions
            .filter((run) => inRange(run.date, from, to))
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((run) => [
              run.date, run.type, run.time ?? '', run.distanceKm, run.durationMinutes,
              formatPace(run.distanceKm, run.durationMinutes, 'min/km'), run.inclinePct ?? '', run.avgHeartRate ?? '',
              runCalories(run, bodyWeightKg), run.includedInOtherEstimate ? 'yes' : 'no', run.notes,
            ]),
        ),
      };
    case 'steps':
      return {
        filename: `steps_${stamp}.csv`,
        content: toCsv(
          ['date', 'steps', 'estimatedCalories', 'manualCalories', 'excludedFromActiveCalories', 'source', 'notes'],
          data.stepEntries
            .filter((entry) => inRange(entry.date, from, to))
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((entry) => [
              entry.date, entry.steps, stepCalories(entry, bodyWeightKg), entry.manualCalories ?? '',
              entry.includedInOtherEstimate ? 'yes' : 'no', entry.source, entry.notes,
            ]),
        ),
      };
    case 'study':
      return {
        filename: `study_${stamp}.csv`,
        content: toCsv(
          ['date', 'subject', 'chapter', 'topic', 'plannedMinutes', 'actualMinutes', 'startTime', 'endTime', 'status', 'confidence', 'revisionDate', 'notes'],
          data.studySessions
            .filter((session) => inRange(session.date, from, to))
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((session) => [
              session.date,
              data.subjects.find((subject) => subject.id === session.subjectId)?.name ?? '',
              data.chapters.find((chapter) => chapter.id === session.chapterId)?.name ?? '',
              session.topic, session.plannedMinutes, session.actualMinutes, session.startTime ?? '', session.endTime ?? '',
              session.status, session.confidence ?? '', session.revisionDate ?? '', session.notes,
            ]),
        ),
      };
    case 'daily':
    default:
      return {
        filename: `daily_summary_${stamp}.csv`,
        content: toCsv(
          [
            'date', 'tasksCompleted', 'tasksEligible', 'taskPercent', 'mandatoryPercent', 'calories', 'calorieTarget',
            'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'activeCalories', 'expenditureMethod', 'estimatedExpenditure',
            'estimatedBalance', 'steps', 'stepTarget', 'trainingVolumeKg', 'runKm', 'studyMinutes', 'studyTarget',
            'dayOutcome', 'mood', 'energy',
          ],
          dailyRows ?? [],
        ),
      };
  }
}

/** Triggers a browser download for text content. */
export function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
