import { useApp } from '../state/AppStore';
import { Badge, Card, NumberInput, Select, Stat, TextArea, Toggle } from './Ui';
import { RECORD_SCHEMA_VERSION } from '../types/models';
import type { DayNote, DayNutrition, ISODate } from '../types/models';
import { formatLongDate, formatShortDate, nowInstant } from '../lib/date';
import { uuid } from '../lib/uuid';
import { evaluateDay } from '../lib/calc/streak';
import { formatPace, sessionCalories, sessionSetCount, sessionVolume, runCalories, kmToMi } from '../lib/calc/fitness';
import { METHOD_EXPLANATIONS } from '../lib/calc/energy';
import { round } from '../lib/validate';

/**
 * The full record for one date. Every value shown is recomputed from source
 * records, so editing a historical entry updates this view and the streaks that
 * depend on it.
 */
export function DayDetail({ date }: { date: ISODate }): JSX.Element {
  const { summaryFor, settings, index, today, actions } = useApp();
  const summary = summaryFor(date);
  const evaluation = evaluateDay(summary, settings, today);
  const note = index.notes.get(date);

  async function saveBodyWeight(value: number | null): Promise<void> {
    const now = nowInstant();
    const existing = index.nutrition.get(date);
    const base: DayNutrition = existing ?? {
      id: uuid(), createdAt: now, updatedAt: now, v: RECORD_SCHEMA_VERSION,
      date, tz: settings.timeZone, mode: 'itemised', quickCalories: 0, quickProtein: 0,
      quickCarbs: 0, quickFat: 0, quickFibre: 0, waterMl: 0, bodyWeightKg: null,
    };
    await actions.putRecord('dayNutrition', { ...base, bodyWeightKg: value });
  }

  async function saveNote(patch: Partial<DayNote>): Promise<void> {
    const now = nowInstant();
    const base: DayNote = note ?? {
      id: uuid(), createdAt: now, updatedAt: now, v: RECORD_SCHEMA_VERSION,
      date, tz: settings.timeZone, note: '', mood: null, energy: null, restDay: false, excused: false,
    };
    await actions.putRecord('dayNotes', { ...base, ...patch });
  }

  const outcomeTone =
    evaluation.outcome === 'success' || evaluation.outcome === 'rest'
      ? 'ok'
      : evaluation.outcome === 'excused'
        ? 'warn'
        : evaluation.outcome === 'future'
          ? 'neutral'
          : 'bad';

  return (
    <div className="stack">
      <Card title={formatLongDate(date)} subtitle={date === today ? 'Today' : undefined} headingLevel={3}>
        <div className="row" style={{ marginBottom: 10 }}>
          <Badge tone={outcomeTone}>
            {evaluation.outcome === 'success'
              ? 'Successful day'
              : evaluation.outcome === 'rest'
                ? 'Planned rest day'
                : evaluation.outcome === 'excused'
                  ? 'Excused day'
                  : evaluation.outcome === 'future'
                    ? 'Upcoming'
                    : 'Day not qualified'}
          </Badge>
          <span className="small muted">{evaluation.reason}</span>
        </div>

        {evaluation.conditions.length > 0 && (
          <ul className="list">
            {evaluation.conditions.map((condition) => (
              <li key={condition.key} className={`item ${condition.met ? 'is-done' : 'is-missed'}`}>
                <span aria-hidden="true" style={{ fontWeight: 800 }}>{condition.met ? '✓' : '✗'}</span>
                <div className="item-main">
                  <div className="item-title">{condition.label}</div>
                  <div className="item-meta">
                    <span>{condition.detail}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Tasks" headingLevel={3}>
        <div className="grid grid-4" style={{ marginBottom: 10 }}>
          <Stat label="Completed" value={`${summary.tasks.all.completed}/${summary.tasks.all.eligible}`} sub={`${summary.tasks.all.percent}%`} />
          <Stat
            label="Mandatory"
            value={summary.tasks.mandatory.eligible === 0 ? '—' : `${summary.tasks.mandatory.completed}/${summary.tasks.mandatory.eligible}`}
            sub={`${summary.tasks.mandatory.percent}%`}
          />
          <Stat label="Missed" value={summary.tasks.all.missed} />
          <Stat label="Excused" value={summary.tasks.all.excused} />
        </div>
        {summary.taskList.length === 0 ? (
          <p className="small muted">No tasks were scheduled on this day.</p>
        ) : (
          <ul className="list">
            {summary.taskList.map((task) => (
              <li
                key={task.id}
                className={`item ${task.status === 'completed' ? 'is-done' : ''} ${task.status === 'skipped' ? 'is-missed' : ''} ${
                  task.status === 'excused' ? 'is-excused' : ''
                }`}
              >
                <div className="item-main">
                  <div className="item-title">{task.title}</div>
                  <div className="item-meta">
                    <Badge tone="neutral">{task.category}</Badge>
                    <Badge
                      tone={
                        task.status === 'completed' ? 'ok' : task.status === 'skipped' ? 'bad' : task.status === 'excused' ? 'warn' : 'neutral'
                      }
                    >
                      {task.status}
                    </Badge>
                    {task.mandatory && <span>Mandatory</span>}
                    {task.dueTime && <span>Due {task.dueTime}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Nutrition and energy" headingLevel={3}>
        <div className="grid grid-4">
          <Stat label="Calories" value={round(summary.nutrition.calories, 0)} sub={`Target ${summary.targets.calories} kcal`} />
          <Stat label="Protein" value={`${round(summary.nutrition.protein, 0)} g`} sub={`Target ${summary.targets.protein} g`} />
          <Stat label="Carbohydrate" value={`${round(summary.nutrition.carbs, 0)} g`} sub={`Target ${summary.targets.carbs} g`} />
          <Stat label="Fat" value={`${round(summary.nutrition.fat, 0)} g`} sub={`Target ${summary.targets.fat} g`} />
        </div>
        <div className="grid grid-3" style={{ marginTop: 10 }}>
          <Stat label="Logging mode" value={summary.nutrition.mode === 'quick' ? 'Quick total' : 'Itemised'} sub={`${summary.nutrition.entryCount} entries`} />
          <Stat label="Estimated expenditure" value={`${summary.energy.totalExpenditure} kcal`} sub={summary.energy.methodLabel} />
          <Stat
            label={summary.energy.label === 'estimated surplus' ? 'Estimated surplus' : 'Estimated deficit'}
            value={summary.nutrition.calories > 0 ? `${summary.energy.magnitude} kcal` : '—'}
            tone={summary.nutrition.calories > 0 ? (summary.energy.balance >= 0 ? 'ok' : 'warn') : undefined}
            sub={summary.nutrition.calories > 0 ? summary.energy.methodLabel : 'No food logged on this day'}
          />
        </div>
        <p className="tiny muted" style={{ marginTop: 8 }}>
          {METHOD_EXPLANATIONS[summary.energy.method]} Active calories from logged exercise:{' '}
          <strong>{summary.active.total} kcal</strong>
          {summary.active.excluded > 0 ? ` (${summary.active.excluded} kcal excluded as already counted).` : '.'} All energy
          figures are estimates.
        </p>
      </Card>

      <Card title="Training, running and steps" headingLevel={3}>
        <div className="grid grid-4">
          <Stat label="Gym sessions" value={summary.gym.length} sub={`${round(summary.trainingVolumeKg, 0)} kg volume`} />
          <Stat
            label="Run distance"
            value={settings.distanceUnit === 'km' ? `${round(summary.runDistanceKm, 2)} km` : `${round(kmToMi(summary.runDistanceKm), 2)} mi`}
            sub={`${summary.runDurationMinutes} min`}
          />
          <Stat label="Steps" value={summary.stepCount.toLocaleString()} sub={`Target ${summary.targets.steps.toLocaleString()}`} />
          <Stat label="Active calories" value={`${summary.active.total} kcal`} sub="Non-duplicated estimate" />
        </div>
        {summary.gym.length > 0 && (
          <ul className="list" style={{ marginTop: 10 }}>
            {summary.gym.map((session) => (
              <li key={session.id} className="item">
                <div className="item-main">
                  <div className="item-title">{session.name}</div>
                  <div className="item-meta">
                    <span>{session.durationMinutes} min</span>
                    <span>{sessionSetCount(session)} sets</span>
                    <span>{round(sessionVolume(session), 0)} kg volume</span>
                    <span>{sessionCalories(session, settings.bodyWeightKg)} kcal est.</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {summary.runs.length > 0 && (
          <ul className="list" style={{ marginTop: 10 }}>
            {summary.runs.map((run) => (
              <li key={run.id} className="item">
                <div className="item-main">
                  <div className="item-title">{run.type === 'outdoor' ? 'Outdoor run' : 'Treadmill run'}</div>
                  <div className="item-meta">
                    <span>{round(run.distanceKm, 2)} km</span>
                    <span>{run.durationMinutes} min</span>
                    <span>{formatPace(run.distanceKm, run.durationMinutes, settings.paceUnit)}</span>
                    <span>{runCalories(run, settings.bodyWeightKg)} kcal est.</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Study" headingLevel={3}>
        <div className="grid grid-3">
          <Stat label="Minutes" value={summary.studyTotals.minutes} sub={`Target ${summary.targets.studyMinutes} min`} />
          <Stat label="Sessions" value={summary.studyTotals.sessions} />
          <Stat label="Average confidence" value={summary.studyTotals.averageConfidence ?? '—'} />
        </div>
        {summary.study.length > 0 && (
          <ul className="list" style={{ marginTop: 10 }}>
            {summary.study.map((session) => (
              <li key={session.id} className="item">
                <div className="item-main">
                  <div className="item-title">{session.topic || 'Study session'}</div>
                  <div className="item-meta">
                    <span>{session.actualMinutes} min</span>
                    <Badge tone="neutral">{session.status}</Badge>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Notes, mood and energy" headingLevel={3}>
        <TextArea label="Day note" value={note?.note ?? ''} onChange={(value) => void saveNote({ note: value })} rows={3} />
        <div className="grid grid-2" style={{ marginTop: 10 }}>
          <Select
            label="Mood"
            value={String(note?.mood ?? '')}
            options={[
              { value: '', label: 'Not recorded' },
              { value: '1', label: '1 - rough' },
              { value: '2', label: '2' },
              { value: '3', label: '3 - okay' },
              { value: '4', label: '4' },
              { value: '5', label: '5 - great' },
            ]}
            onChange={(value) => void saveNote({ mood: value === '' ? null : Number(value) })}
          />
          <Select
            label="Energy"
            value={String(note?.energy ?? '')}
            options={[
              { value: '', label: 'Not recorded' },
              { value: '1', label: '1 - drained' },
              { value: '2', label: '2' },
              { value: '3', label: '3 - okay' },
              { value: '4', label: '4' },
              { value: '5', label: '5 - buzzing' },
            ]}
            onChange={(value) => void saveNote({ energy: value === '' ? null : Number(value) })}
          />
        </div>
        <Toggle
          label="Planned rest day"
          checked={note?.restDay ?? false}
          onChange={(checked) => void saveNote({ restDay: checked })}
          hint="Rest days can count as successful days instead of breaking a streak (Settings > Streaks)."
        />
        <Toggle
          label="Excused day"
          checked={note?.excused ?? false}
          onChange={(checked) => void saveNote({ excused: checked })}
          hint="Excused days are skipped when the streak is counted, and stay visible in your history."
        />
        {settings.trackBodyWeight && (
          <NumberInput
            label="Body weight recorded on this day"
            suffix="kg"
            allowEmpty
            value={index.nutrition.get(date)?.bodyWeightKg ?? null}
            min={0}
            max={500}
            step={0.1}
            onChange={(value) => void saveBodyWeight(value)}
            hint="Stored against this date only; it does not change any other day."
          />
        )}
        <p className="tiny muted" style={{ marginTop: 6 }}>
          Every figure above is recalculated from your records for {formatShortDate(date)} whenever you change something.
        </p>
      </Card>
    </div>
  );
}
