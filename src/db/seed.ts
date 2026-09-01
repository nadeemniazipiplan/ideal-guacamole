import { RECORD_SCHEMA_VERSION } from '../types/models';
import type {
  Chapter, DayNutrition, FoodEntry, GymSession, ISODate, RunSession, StepEntry, StudySession, Subject,
  TaskInstance, TaskTemplate,
} from '../types/models';
import { addDays, dayOfWeek, nowInstant } from '../lib/date';
import { instanceIdFor } from '../lib/recurrence';

/**
 * A small, clearly marked demo dataset.
 *
 * Every record id starts with `demo-`, which is how "Remove demo data" finds
 * them. Real records never carry that prefix, so removing the demo set cannot
 * touch anything you entered yourself.
 */
export const DEMO_PREFIX = 'demo-';

export function isDemoRecord(record: { id: string }): boolean {
  return record.id.startsWith(DEMO_PREFIX);
}

interface DemoData {
  taskTemplates: TaskTemplate[];
  taskInstances: TaskInstance[];
  foodEntries: FoodEntry[];
  dayNutrition: DayNutrition[];
  gymSessions: GymSession[];
  runSessions: RunSession[];
  stepEntries: StepEntry[];
  subjects: Subject[];
  chapters: Chapter[];
  studySessions: StudySession[];
}

/** Deterministic pseudo-random so the demo set looks the same every time. */
function wobble(seed: number, spread: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2 * spread;
}

export function buildDemoData(today: ISODate, tz: string, days = 14): DemoData {
  const now = nowInstant();
  const base = { createdAt: now, updatedAt: now, v: RECORD_SCHEMA_VERSION };

  const template: TaskTemplate = {
    ...base,
    id: `${DEMO_PREFIX}template-morning`,
    title: 'DEMO - Morning routine',
    description: 'Sample repeating task from the demo dataset',
    category: 'Routine',
    dueTime: '07:30',
    estimatedMinutes: 20,
    priority: 'medium',
    mandatory: true,
    notes: '',
    recurrence: { kind: 'daily', daysOfWeek: [], intervalDays: 1, startDate: addDays(today, -days + 1), endDate: null },
    archived: false,
    order: 0,
    tz,
  };

  const subjects: Subject[] = [
    { ...base, id: `${DEMO_PREFIX}subject-maths`, name: 'DEMO - Mathematics', colour: '#4F46E5', archived: false },
    { ...base, id: `${DEMO_PREFIX}subject-physics`, name: 'DEMO - Physics', colour: '#0891B2', archived: false },
  ];

  const chapters: Chapter[] = [
    { ...base, id: `${DEMO_PREFIX}chapter-1`, subjectId: subjects[0].id, name: 'Calculus basics', completed: true, completedDate: addDays(today, -8), order: 0 },
    { ...base, id: `${DEMO_PREFIX}chapter-2`, subjectId: subjects[0].id, name: 'Integration', completed: false, completedDate: null, order: 1 },
    { ...base, id: `${DEMO_PREFIX}chapter-3`, subjectId: subjects[1].id, name: 'Kinematics', completed: true, completedDate: addDays(today, -3), order: 0 },
  ];

  const taskInstances: TaskInstance[] = [];
  const foodEntries: FoodEntry[] = [];
  const dayNutrition: DayNutrition[] = [];
  const gymSessions: GymSession[] = [];
  const runSessions: RunSession[] = [];
  const stepEntries: StepEntry[] = [];
  const studySessions: StudySession[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset);
    const seed = days - offset;
    const dated = { ...base, date, tz };

    taskInstances.push({
      ...dated,
      id: instanceIdFor(template.id, date),
      templateId: template.id,
      title: template.title,
      description: template.description,
      category: 'Routine',
      dueTime: '07:30',
      estimatedMinutes: 20,
      priority: 'medium',
      mandatory: true,
      notes: '',
      status: seed % 6 === 0 ? 'skipped' : 'completed',
      completedAt: seed % 6 === 0 ? null : now,
      order: 0,
      carriedToDate: null,
      carriedFromId: null,
    });

    taskInstances.push({
      ...dated,
      id: `${DEMO_PREFIX}task-read-${date}`,
      templateId: null,
      title: 'DEMO - Read 20 pages',
      description: '',
      category: 'Personal',
      dueTime: '21:00',
      estimatedMinutes: 30,
      priority: 'low',
      mandatory: false,
      notes: '',
      status: seed % 3 === 0 ? 'pending' : 'completed',
      completedAt: seed % 3 === 0 ? null : now,
      order: 1,
      carriedToDate: null,
      carriedFromId: null,
    });

    dayNutrition.push({ ...dated, id: `${DEMO_PREFIX}nutrition-${date}`, mode: 'itemised', quickCalories: 0, quickProtein: 0, quickCarbs: 0, quickFat: 0, quickFibre: 0, waterMl: 2000, bodyWeightKg: null });

    const meals: { meal: string; name: string; kcal: number; p: number; c: number; f: number; time: string }[] = [
      { meal: 'Breakfast', name: 'DEMO - Oats and yoghurt', kcal: 480, p: 28, c: 62, f: 12, time: '08:00' },
      { meal: 'Lunch', name: 'DEMO - Chicken and rice', kcal: 720, p: 52, c: 78, f: 18, time: '13:30' },
      { meal: 'Dinner', name: 'DEMO - Beef and vegetables', kcal: 690, p: 48, c: 44, f: 32, time: '20:00' },
      { meal: 'Snacks', name: 'DEMO - Fruit and nuts', kcal: 260, p: 8, c: 26, f: 14, time: '17:00' },
    ];
    for (const [mealIndex, meal] of meals.entries()) {
      foodEntries.push({
        ...dated,
        id: `${DEMO_PREFIX}food-${date}-${mealIndex}`,
        meal: meal.meal,
        name: meal.name,
        quantity: '1 serving',
        calories: Math.round(meal.kcal + wobble(seed + mealIndex, 60)),
        protein: Math.round(meal.p + wobble(seed + mealIndex + 1, 5)),
        carbs: Math.round(meal.c + wobble(seed + mealIndex + 2, 8)),
        fat: Math.round(meal.f + wobble(seed + mealIndex + 3, 4)),
        fibre: 6,
        time: meal.time,
        notes: '',
      });
    }

    stepEntries.push({
      ...dated,
      id: `${DEMO_PREFIX}steps-${date}`,
      steps: Math.max(2000, Math.round(8600 + wobble(seed, 3200))),
      includedInOtherEstimate: false,
      manualCalories: null,
      notes: '',
      source: 'manual',
    });

    const weekday = dayOfWeek(date);
    if (weekday === 1 || weekday === 3 || weekday === 5) {
      gymSessions.push({
        ...dated,
        id: `${DEMO_PREFIX}gym-${date}`,
        name: weekday === 1 ? 'DEMO - Push day' : weekday === 3 ? 'DEMO - Pull day' : 'DEMO - Leg day',
        time: '18:00',
        durationMinutes: 60,
        muscleGroups: weekday === 1 ? ['Chest', 'Shoulders'] : weekday === 3 ? ['Back', 'Arms'] : ['Legs'],
        exercises: [
          {
            id: `${DEMO_PREFIX}ex-${date}-1`,
            name: weekday === 1 ? 'Bench press' : weekday === 3 ? 'Barbell row' : 'Back squat',
            muscleGroup: weekday === 1 ? 'Chest' : weekday === 3 ? 'Back' : 'Legs',
            notes: '',
            sets: [1, 2, 3].map((setNumber) => ({
              id: `${DEMO_PREFIX}set-${date}-${setNumber}`,
              setNumber,
              reps: 8,
              weight: Math.round(60 + seed * 0.8 + wobble(seed + setNumber, 4)),
              unit: 'kg' as const,
              rpe: 8,
              restSeconds: 120,
              notes: '',
            })),
          },
        ],
        notes: '',
        manualCalories: null,
        met: 6,
        includedInOtherEstimate: false,
      });
    }

    if (weekday === 2 || weekday === 6) {
      runSessions.push({
        ...dated,
        id: `${DEMO_PREFIX}run-${date}`,
        type: weekday === 6 ? 'outdoor' : 'treadmill',
        time: '07:00',
        distanceKm: Math.round((5 + wobble(seed, 1.5)) * 100) / 100,
        durationMinutes: Math.round(30 + wobble(seed, 6)),
        inclinePct: weekday === 2 ? 1 : null,
        avgHeartRate: 152,
        notes: '',
        manualCalories: null,
        met: 9.8,
        includedInOtherEstimate: false,
      });
    }

    studySessions.push({
      ...dated,
      id: `${DEMO_PREFIX}study-${date}`,
      subjectId: seed % 2 === 0 ? subjects[0].id : subjects[1].id,
      chapterId: seed % 2 === 0 ? chapters[1].id : chapters[2].id,
      topic: seed % 2 === 0 ? 'DEMO - Integration practice' : 'DEMO - Kinematics problems',
      plannedMinutes: 120,
      actualMinutes: Math.max(30, Math.round(110 + wobble(seed, 45))),
      startTime: '21:00',
      endTime: '23:00',
      status: 'completed',
      confidence: 3 + (seed % 3 === 0 ? 1 : 0),
      revisionDate: null,
      notes: '',
    });
  }

  return { taskTemplates: [template], taskInstances, foodEntries, dayNutrition, gymSessions, runSessions, stepEntries, subjects, chapters, studySessions };
}
