import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppStore';
import {
  Badge, Card, EmptyState, Modal, NumberInput, SectionTabs, Select, Stat, TabPanel, TextArea, TextInput, Toggle,
} from '../components/Ui';
import { PageHero } from '../components/AppShell';
import { BarChart } from '../components/Charts';
import { decorUrl } from '../components/ThemeScope';
import { MET_PRESETS, MUSCLE_GROUPS } from '../db/defaults';
import { RECORD_SCHEMA_VERSION } from '../types/models';
import type { Exercise, ExerciseSet, GymSession, RunSession, RunType, StepEntry, WeightUnit, WorkoutTemplate } from '../types/models';
import { endOfWeek, formatLongDate, formatShortDate, nowInstant, rangeDates, startOfWeek, weekdayName } from '../lib/date';
import { uuid } from '../lib/uuid';
import {
  activeCalories, exerciseVolume, formatPace, formatSpeed, fromKg, kmToMi, metCalories, personalRecords,
  previousPerformance, runCalories, sessionCalories, sessionSetCount, sessionVolume, stepCalories,
} from '../lib/calc/fitness';
import { targetsForDate } from '../lib/calc/targets';
import { consumeIntent } from '../lib/bus';
import { LIMITS, round, text as cleanText, multilineText } from '../lib/validate';

type Tab = 'gym' | 'running' | 'steps';

function newSet(setNumber: number, unit: WeightUnit): ExerciseSet {
  return { id: uuid(), setNumber, reps: 8, weight: 0, unit, rpe: null, restSeconds: null, notes: '' };
}

function newExercise(unit: WeightUnit): Exercise {
  return { id: uuid(), name: '', muscleGroup: MUSCLE_GROUPS[0], sets: [newSet(1, unit)], notes: '' };
}

function newGymSession(date: string, tz: string, unit: WeightUnit): GymSession {
  const now = nowInstant();
  return {
    id: uuid(), createdAt: now, updatedAt: now, v: RECORD_SCHEMA_VERSION, date, tz,
    name: 'Workout', time: '', durationMinutes: 60, muscleGroups: [], exercises: [newExercise(unit)],
    notes: '', manualCalories: null, met: 6, includedInOtherEstimate: false,
  };
}

function newRun(date: string, tz: string): RunSession {
  const now = nowInstant();
  return {
    id: uuid(), createdAt: now, updatedAt: now, v: RECORD_SCHEMA_VERSION, date, tz,
    type: 'outdoor', time: '', distanceKm: 5, durationMinutes: 30, inclinePct: null, avgHeartRate: null,
    notes: '', manualCalories: null, met: 9.8, includedInOtherEstimate: false,
  };
}

export default function FitnessPage(): JSX.Element {
  const { data, index, settings, selectedDate, actions, notify } = useApp();
  const [tab, setTab] = useState<Tab>('gym');
  const [gymDraft, setGymDraft] = useState<GymSession | null>(null);
  const [runDraft, setRunDraft] = useState<RunSession | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    const intent = consumeIntent(['gym', 'run', 'steps']);
    if (intent === 'gym') {
      setTab('gym');
      setGymDraft(newGymSession(selectedDate, settings.timeZone, settings.weightUnit));
    } else if (intent === 'run') {
      setTab('running');
      setRunDraft(newRun(selectedDate, settings.timeZone));
    } else if (intent === 'steps') {
      setTab('steps');
    }
    // Intent is a one-shot hand-off from the quick-add control.

  }, []);

  const gymSessions = index.gym.get(selectedDate) ?? [];
  const runs = index.runs.get(selectedDate) ?? [];
  const stepEntry = index.steps.get(selectedDate);
  const targets = targetsForDate(data.targetVersions, selectedDate);
  const active = activeCalories(gymSessions, runs, stepEntry ? [stepEntry] : [], settings.bodyWeightKg);
  const records = useMemo(() => personalRecords(data.gymSessions), [data.gymSessions]);

  const weekDates = rangeDates(startOfWeek(selectedDate, settings.weekStart), endOfWeek(selectedDate, settings.weekStart));

  async function saveStepEntry(patch: Partial<StepEntry>): Promise<void> {
    const now = nowInstant();
    const base: StepEntry = stepEntry ?? {
      id: uuid(), createdAt: now, updatedAt: now, v: RECORD_SCHEMA_VERSION,
      date: selectedDate, tz: settings.timeZone, steps: 0, includedInOtherEstimate: settings.expenditureMethod === 'full_tdee',
      manualCalories: null, notes: '', source: 'manual',
    };
    await actions.putRecord('stepEntries', { ...base, ...patch });
  }

  return (
    <div className="page">
      <PageHero
        title="Fitness"
        subtitle={`${formatLongDate(selectedDate)} · ${active.total} kcal estimated active energy`}
        decor={settings.showDecorations ? decorUrl('mascot-titan-runner') : undefined}
      />

      <div className="grid grid-4">
        <Stat label="Gym sessions" value={gymSessions.length} sub={`${round(gymSessions.reduce((s, g) => s + sessionVolume(g), 0), 0)} kg volume`} />
        <Stat
          label="Running"
          value={settings.distanceUnit === 'km' ? `${round(runs.reduce((s, r) => s + r.distanceKm, 0), 2)} km` : `${round(kmToMi(runs.reduce((s, r) => s + r.distanceKm, 0)), 2)} mi`}
          sub={`${round(runs.reduce((s, r) => s + r.durationMinutes, 0), 0)} minutes`}
        />
        <Stat label="Steps" value={(stepEntry?.steps ?? 0).toLocaleString()} sub={`Target ${targets.steps.toLocaleString()}`} tone={(stepEntry?.steps ?? 0) >= targets.steps ? 'ok' : undefined} />
        <Stat
          label="Active calories"
          value={`${active.total} kcal`}
          sub={active.excluded > 0 ? `${active.excluded} kcal excluded as duplicates` : 'Estimate, non-duplicated only'}
        />
      </div>

      <SectionTabs
        label="Fitness sections"
        value={tab}
        options={[
          { value: 'gym', label: 'Gym' },
          { value: 'running', label: 'Running' },
          { value: 'steps', label: 'Steps' },
        ]}
        onChange={setTab}
      />

      {/* ------------------------------------------------------------- gym */}
      {tab === 'gym' && (
        <TabPanel id="gym">
          <Card
            title="Gym log"
            subtitle={formatShortDate(selectedDate)}
            actions={
              <>
                <button type="button" className="btn btn-sm" onClick={() => setShowTemplates(true)}>
                  Templates ({data.workoutTemplates.length})
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setGymDraft(newGymSession(selectedDate, settings.timeZone, settings.weightUnit))}
                >
                  + Log workout
                </button>
              </>
            }
          >
            {gymSessions.length === 0 ? (
              <EmptyState
                title="No workout logged for this day"
                action={
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setGymDraft(newGymSession(selectedDate, settings.timeZone, settings.weightUnit))}
                  >
                    Log a workout
                  </button>
                }
              >
                Record exercises, sets, reps and load. Your previous performance for each exercise is shown while you type.
              </EmptyState>
            ) : (
              <ul className="list">
                {gymSessions.map((session) => (
                  <li key={session.id} className="item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <div className="row">
                      <strong>{session.name}</strong>
                      {session.time && <Badge tone="neutral">{session.time}</Badge>}
                      <Badge tone="neutral">{session.durationMinutes} min</Badge>
                      <Badge tone="neutral">{sessionSetCount(session)} sets</Badge>
                      <Badge tone="neutral">{round(sessionVolume(session), 0)} kg volume</Badge>
                      <Badge tone={session.includedInOtherEstimate ? 'warn' : 'ok'}>
                        {sessionCalories(session, settings.bodyWeightKg)} kcal est.
                        {session.includedInOtherEstimate ? ' (excluded)' : ''}
                      </Badge>
                      <span className="right row-tight">
                        <button type="button" className="btn btn-sm" onClick={() => setGymDraft(session)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => void actions.removeRecord('gymSessions', session.id, 'Gym session')}
                        >
                          Delete
                        </button>
                      </span>
                    </div>
                    <div className="table-wrap" style={{ marginTop: 8 }}>
                      <table>
                        <caption>{session.name} - sets</caption>
                        <thead>
                          <tr>
                            <th scope="col">Exercise</th>
                            <th scope="col">Muscle group</th>
                            <th scope="col">Set</th>
                            <th scope="col">Reps</th>
                            <th scope="col">Load</th>
                            <th scope="col">RPE</th>
                            <th scope="col">Rest</th>
                          </tr>
                        </thead>
                        <tbody>
                          {session.exercises.flatMap((exercise) =>
                            exercise.sets.map((set) => (
                              <tr key={set.id}>
                                <th scope="row">{exercise.name || 'Unnamed'}</th>
                                <td>{exercise.muscleGroup}</td>
                                <td>{set.setNumber}</td>
                                <td>{set.reps}</td>
                                <td>
                                  {round(set.weight, 1)} {set.unit}
                                </td>
                                <td>{set.rpe ?? '—'}</td>
                                <td>{set.restSeconds ? `${set.restSeconds}s` : '—'}</td>
                              </tr>
                            )),
                          )}
                        </tbody>
                      </table>
                    </div>
                    {session.notes && <p className="small muted" style={{ marginTop: 6 }}>{session.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Personal records" subtitle="Best figures across every session you have logged.">
            {records.length === 0 ? (
              <EmptyState title="No records yet">Log a workout with at least one set and your bests appear here.</EmptyState>
            ) : (
              <div className="table-wrap">
                <table>
                  <caption>Personal records by exercise</caption>
                  <thead>
                    <tr>
                      <th scope="col">Exercise</th>
                      <th scope="col">Best load</th>
                      <th scope="col">Most reps</th>
                      <th scope="col">Best set volume</th>
                      <th scope="col">Sessions</th>
                      <th scope="col">Last done</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.slice(0, 12).map((record) => (
                      <tr key={record.exercise}>
                        <th scope="row">{record.exercise}</th>
                        <td>
                          {round(fromKg(record.bestWeightKg, settings.weightUnit), 1)} {settings.weightUnit}
                        </td>
                        <td>{record.bestReps}</td>
                        <td>{round(record.bestVolumeKg, 0)} kg</td>
                        <td>{record.sessions}</td>
                        <td>{formatShortDate(record.lastDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Training volume this week">
            <BarChart
              title="Training volume by day"
              unit=" kg"
              data={weekDates.map((date) => ({
                label: weekdayName(date, true),
                fullLabel: formatShortDate(date),
                value: round((index.gym.get(date) ?? []).reduce((sum, session) => sum + sessionVolume(session), 0), 0),
              }))}
            />
          </Card>
        </TabPanel>
      )}

      {/* --------------------------------------------------------- running */}
      {tab === 'running' && (
        <TabPanel id="running">
          <Card
            title="Running log"
            subtitle={formatShortDate(selectedDate)}
            actions={
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setRunDraft(newRun(selectedDate, settings.timeZone))}>
                + Log run
              </button>
            }
          >
            {runs.length === 0 ? (
              <EmptyState
                title="No run logged for this day"
                action={
                  <button type="button" className="btn btn-primary" onClick={() => setRunDraft(newRun(selectedDate, settings.timeZone))}>
                    Log a run
                  </button>
                }
              >
                Enter distance and duration - average pace and speed are calculated for you.
              </EmptyState>
            ) : (
              <ul className="list">
                {runs.map((run) => (
                  <li key={run.id} className="item">
                    <div className="item-main">
                      <div className="item-title">
                        {run.type === 'outdoor' ? 'Outdoor run' : 'Treadmill run'}
                        {run.time ? ` · ${run.time}` : ''}
                      </div>
                      <div className="item-meta">
                        <span>
                          {settings.distanceUnit === 'km'
                            ? `${round(run.distanceKm, 2)} km`
                            : `${round(kmToMi(run.distanceKm), 2)} mi`}
                        </span>
                        <span>{round(run.durationMinutes, 0)} min</span>
                        <span>Pace {formatPace(run.distanceKm, run.durationMinutes, settings.paceUnit)}</span>
                        <span>Speed {formatSpeed(run.distanceKm, run.durationMinutes, settings.distanceUnit)}</span>
                        {run.inclinePct !== null && <span>Incline {run.inclinePct}%</span>}
                        {run.avgHeartRate !== null && <span>{run.avgHeartRate} bpm</span>}
                        <Badge tone={run.includedInOtherEstimate ? 'warn' : 'ok'}>
                          {runCalories(run, settings.bodyWeightKg)} kcal est.
                          {run.includedInOtherEstimate ? ' (excluded)' : ''}
                        </Badge>
                      </div>
                      {run.notes && <div className="small muted">{run.notes}</div>}
                    </div>
                    <div className="row-tight">
                      <button type="button" className="btn btn-sm" onClick={() => setRunDraft(run)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => void actions.removeRecord('runSessions', run.id, 'Run')}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Distance this week">
            <BarChart
              title="Running distance by day"
              unit={settings.distanceUnit === 'km' ? ' km' : ' mi'}
              decimals={2}
              data={weekDates.map((date) => {
                const km = (index.runs.get(date) ?? []).reduce((sum, run) => sum + run.distanceKm, 0);
                return {
                  label: weekdayName(date, true),
                  fullLabel: formatShortDate(date),
                  value: settings.distanceUnit === 'km' ? round(km, 2) : round(kmToMi(km), 2),
                };
              })}
            />
          </Card>
        </TabPanel>
      )}

      {/* ----------------------------------------------------------- steps */}
      {tab === 'steps' && (
        <TabPanel id="steps">
          <Card title="Steps" subtitle={formatShortDate(selectedDate)}>
            <div className="grid grid-2">
              <NumberInput
                label="Steps today"
                value={stepEntry?.steps ?? 0}
                min={0}
                max={LIMITS.steps}
                onChange={(value) => void saveStepEntry({ steps: Math.round(value ?? 0) })}
              />
              <NumberInput
                label="Estimated calories (optional override)"
                suffix="kcal"
                allowEmpty
                value={stepEntry?.manualCalories ?? null}
                min={0}
                max={LIMITS.calories}
                onChange={(value) => void saveStepEntry({ manualCalories: value })}
                hint={`Leave blank to use the walking estimate (${stepEntry ? stepCalories({ ...stepEntry, manualCalories: null }, settings.bodyWeightKg) : 0} kcal).`}
              />
            </div>
            <Toggle
              label="Already included in another estimate"
              checked={stepEntry?.includedInOtherEstimate ?? settings.expenditureMethod === 'full_tdee'}
              onChange={(checked) => void saveStepEntry({ includedInOtherEstimate: checked })}
              hint="Switch on when your TDEE or a logged workout already covers this walking, so it is not counted twice."
            />
            <TextArea label="Notes" value={stepEntry?.notes ?? ''} onChange={(value) => void saveStepEntry({ notes: multilineText(value, 300) })} rows={2} />

            <div className="note-banner" style={{ marginTop: 12 }}>
              Steps are entered by hand. This app does <strong>not</strong> read Apple Health, Google Fit or any device
              sensor - there is no automatic health data access here. A clearly marked integration point is reserved in
              <code> src/lib/calc/fitness.ts</code> if you add one later.
            </div>
          </Card>

          <Card title="Steps this week">
            <BarChart
              title="Steps by day"
              target={targets.steps}
              targetLabel="Daily target"
              data={weekDates.map((date) => ({
                label: weekdayName(date, true),
                fullLabel: formatShortDate(date),
                value: index.steps.get(date)?.steps ?? 0,
              }))}
            />
          </Card>
        </TabPanel>
      )}

      {/* --------------------------------------------------------- modals */}

      {gymDraft && (
        <GymEditor
          session={gymDraft}
          unit={settings.weightUnit}
          bodyWeightKg={settings.bodyWeightKg}
          allSessions={data.gymSessions}
          onCancel={() => setGymDraft(null)}
          onSaveTemplate={async (session) => {
            const now = nowInstant();
            const template: WorkoutTemplate = {
              id: uuid(), createdAt: now, updatedAt: now, v: RECORD_SCHEMA_VERSION,
              name: cleanText(templateName || session.name, 60) || 'Template',
              muscleGroups: session.muscleGroups,
              exercises: session.exercises.map((exercise) => ({
                name: exercise.name,
                muscleGroup: exercise.muscleGroup,
                sets: exercise.sets.length,
                reps: exercise.sets[0]?.reps ?? 8,
                weight: exercise.sets[0]?.weight ?? 0,
                unit: exercise.sets[0]?.unit ?? settings.weightUnit,
              })),
              met: session.met,
              notes: '',
            };
            await actions.putRecord('workoutTemplates', template);
            setTemplateName('');
            notify('Saved as a reusable template.', 'success');
          }}
          onSave={async (session) => {
            await actions.putRecord('gymSessions', session);
            notify('Workout saved.', 'success');
            setGymDraft(null);
          }}
        />
      )}

      {runDraft && (
        <Modal
          title={data.runSessions.some((run) => run.id === runDraft.id) ? 'Edit run' : 'Log run'}
          onClose={() => setRunDraft(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setRunDraft(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  await actions.putRecord('runSessions', runDraft);
                  notify('Run saved.', 'success');
                  setRunDraft(null);
                }}
              >
                Save
              </button>
            </>
          }
        >
          <div className="stack">
            <Select
              label="Type"
              value={runDraft.type}
              options={[
                { value: 'outdoor' as RunType, label: 'Outdoor' },
                { value: 'treadmill' as RunType, label: 'Treadmill' },
              ]}
              onChange={(value) => setRunDraft({ ...runDraft, type: value })}
            />
            <div className="grid grid-3">
              <TextInput label="Time" type="time" value={runDraft.time ?? ''} onChange={(value) => setRunDraft({ ...runDraft, time: value })} />
              <NumberInput
                label="Distance"
                suffix={settings.distanceUnit}
                value={settings.distanceUnit === 'km' ? runDraft.distanceKm : round(kmToMi(runDraft.distanceKm), 3)}
                min={0}
                max={LIMITS.distanceKm}
                step={0.01}
                onChange={(value) =>
                  setRunDraft({ ...runDraft, distanceKm: settings.distanceUnit === 'km' ? (value ?? 0) : (value ?? 0) * 1.609344 })
                }
              />
              <NumberInput
                label="Duration"
                suffix="min"
                value={runDraft.durationMinutes}
                min={0}
                max={LIMITS.minutes}
                onChange={(value) => setRunDraft({ ...runDraft, durationMinutes: value ?? 0 })}
              />
            </div>
            <div className="note-banner">
              Average pace <strong>{formatPace(runDraft.distanceKm, runDraft.durationMinutes, settings.paceUnit)}</strong> ·
              average speed <strong>{formatSpeed(runDraft.distanceKm, runDraft.durationMinutes, settings.distanceUnit)}</strong>
            </div>
            <div className="grid grid-3">
              <NumberInput label="Incline" suffix="%" allowEmpty value={runDraft.inclinePct} min={0} max={40} onChange={(value) => setRunDraft({ ...runDraft, inclinePct: value })} />
              <NumberInput label="Average heart rate" suffix="bpm" allowEmpty value={runDraft.avgHeartRate} min={0} max={LIMITS.heartRate} onChange={(value) => setRunDraft({ ...runDraft, avgHeartRate: value })} />
              <NumberInput label="MET value" value={runDraft.met} min={1} max={LIMITS.met} step={0.1} onChange={(value) => setRunDraft({ ...runDraft, met: value ?? 1 })} hint="Editable - see the presets list in Settings." />
            </div>
            <NumberInput
              label="Manual calories (overrides the estimate)"
              suffix="kcal"
              allowEmpty
              value={runDraft.manualCalories}
              min={0}
              max={LIMITS.calories}
              onChange={(value) => setRunDraft({ ...runDraft, manualCalories: value })}
              hint={`MET estimate: ${metCalories(runDraft.met, settings.bodyWeightKg, runDraft.durationMinutes)} kcal (estimate only).`}
            />
            <Toggle
              label="Already included in another workout or step estimate"
              checked={runDraft.includedInOtherEstimate}
              onChange={(checked) => setRunDraft({ ...runDraft, includedInOtherEstimate: checked })}
              hint="Keeps this run out of the active-calorie total so nothing is double-counted."
            />
            <TextArea label="Notes" value={runDraft.notes} onChange={(value) => setRunDraft({ ...runDraft, notes: value })} rows={2} />
          </div>
        </Modal>
      )}

      {showTemplates && (
        <Modal title="Workout templates" onClose={() => setShowTemplates(false)} wide>
          {data.workoutTemplates.length === 0 ? (
            <EmptyState title="No templates yet">
              Open a workout and use <strong>Save as template</strong> to reuse it on another day.
            </EmptyState>
          ) : (
            <ul className="list">
              {data.workoutTemplates.map((template) => (
                <li key={template.id} className="item">
                  <div className="item-main">
                    <div className="item-title">{template.name}</div>
                    <div className="item-meta">
                      <span>{template.exercises.length} exercises</span>
                      <span>MET {template.met}</span>
                    </div>
                  </div>
                  <div className="row-tight">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => {
                        const session = newGymSession(selectedDate, settings.timeZone, settings.weightUnit);
                        session.name = template.name;
                        session.met = template.met;
                        session.exercises = template.exercises.map((exercise) => ({
                          id: uuid(),
                          name: exercise.name,
                          muscleGroup: exercise.muscleGroup,
                          notes: '',
                          sets: Array.from({ length: Math.max(1, exercise.sets) }, (_, i) => ({
                            id: uuid(), setNumber: i + 1, reps: exercise.reps, weight: exercise.weight,
                            unit: exercise.unit, rpe: null, restSeconds: null, notes: '',
                          })),
                        }));
                        setGymDraft(session);
                        setShowTemplates(false);
                        setTab('gym');
                      }}
                    >
                      Use
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => void actions.removeRecord('workoutTemplates', template.id, 'Template')}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <TextInput label="Template name for the next save" value={templateName} onChange={setTemplateName} />
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ gym editor */

function GymEditor({
  session,
  unit,
  bodyWeightKg,
  allSessions,
  onSave,
  onCancel,
  onSaveTemplate,
}: {
  session: GymSession;
  unit: WeightUnit;
  bodyWeightKg: number;
  allSessions: GymSession[];
  onSave: (session: GymSession) => Promise<void>;
  onCancel: () => void;
  onSaveTemplate: (session: GymSession) => Promise<void>;
}): JSX.Element {
  const [draft, setDraft] = useState<GymSession>(session);

  const update = (patch: Partial<GymSession>) => setDraft((current) => ({ ...current, ...patch }));
  const updateExercise = (exerciseId: string, patch: Partial<Exercise>) =>
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) => (exercise.id === exerciseId ? { ...exercise, ...patch } : exercise)),
    }));

  return (
    <Modal
      title="Workout"
      wide
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={() => void onSaveTemplate(draft)}>
            Save as template
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void onSave(draft)}>
            Save workout
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="grid grid-3">
          <TextInput label="Workout name" value={draft.name} onChange={(value) => update({ name: value })} />
          <TextInput label="Time" type="time" value={draft.time ?? ''} onChange={(value) => update({ time: value })} />
          <NumberInput label="Duration" suffix="min" value={draft.durationMinutes} min={0} max={LIMITS.minutes} onChange={(value) => update({ durationMinutes: value ?? 0 })} />
        </div>

        <div className="field">
          <span className="field-label">Muscle groups</span>
          <div className="row">
            {MUSCLE_GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                className="chip"
                aria-pressed={draft.muscleGroups.includes(group)}
                onClick={() =>
                  update({
                    muscleGroups: draft.muscleGroups.includes(group)
                      ? draft.muscleGroups.filter((item) => item !== group)
                      : [...draft.muscleGroups, group],
                  })
                }
              >
                {group}
              </button>
            ))}
          </div>
        </div>

        {draft.exercises.map((exercise, exerciseIndex) => {
          const previous = previousPerformance(allSessions, exercise.name, draft.date);
          return (
            <div key={exercise.id} className="card" style={{ background: 'var(--card-2)' }}>
              <div className="grid grid-2">
                <TextInput label={`Exercise ${exerciseIndex + 1}`} value={exercise.name} onChange={(value) => updateExercise(exercise.id, { name: value })} />
                <Select
                  label="Muscle group"
                  value={exercise.muscleGroup}
                  options={MUSCLE_GROUPS.map((group) => ({ value: group, label: group }))}
                  onChange={(value) => updateExercise(exercise.id, { muscleGroup: value })}
                />
              </div>

              {previous && (
                <div className="note-banner" style={{ marginTop: 8 }}>
                  Last time ({formatShortDate(previous.date)}):{' '}
                  {previous.exercise.sets.map((set) => `${set.reps}×${round(set.weight, 1)}${set.unit}`).join(', ')} ·
                  volume {round(exerciseVolume(previous.exercise), 0)} kg
                </div>
              )}

              <div className="table-wrap" style={{ marginTop: 8 }}>
                <table>
                  <caption>Sets for {exercise.name || 'this exercise'}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Set</th>
                      <th scope="col">Reps</th>
                      <th scope="col">Load</th>
                      <th scope="col">Unit</th>
                      <th scope="col">RPE</th>
                      <th scope="col">Rest (s)</th>
                      <th scope="col">
                        <span className="visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {exercise.sets.map((set, setIndex) => (
                      <tr key={set.id}>
                        <td>{set.setNumber}</td>
                        <td>
                          <input
                            type="number"
                            aria-label={`Reps for set ${set.setNumber}`}
                            value={set.reps}
                            min={0}
                            max={LIMITS.reps}
                            style={{ width: 80 }}
                            onChange={(event) =>
                              updateExercise(exercise.id, {
                                sets: exercise.sets.map((item, i) => (i === setIndex ? { ...item, reps: Math.max(0, Number(event.target.value) || 0) } : item)),
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            aria-label={`Load for set ${set.setNumber}`}
                            value={set.weight}
                            min={0}
                            max={LIMITS.loadKg}
                            step={0.5}
                            style={{ width: 90 }}
                            onChange={(event) =>
                              updateExercise(exercise.id, {
                                sets: exercise.sets.map((item, i) => (i === setIndex ? { ...item, weight: Math.max(0, Number(event.target.value) || 0) } : item)),
                              })
                            }
                          />
                        </td>
                        <td>
                          <select
                            aria-label={`Unit for set ${set.setNumber}`}
                            value={set.unit}
                            style={{ width: 80 }}
                            onChange={(event) =>
                              updateExercise(exercise.id, {
                                sets: exercise.sets.map((item, i) => (i === setIndex ? { ...item, unit: event.target.value as WeightUnit } : item)),
                              })
                            }
                          >
                            <option value="kg">kg</option>
                            <option value="lb">lb</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            aria-label={`RPE for set ${set.setNumber}`}
                            value={set.rpe ?? ''}
                            min={1}
                            max={10}
                            style={{ width: 70 }}
                            onChange={(event) =>
                              updateExercise(exercise.id, {
                                sets: exercise.sets.map((item, i) =>
                                  i === setIndex ? { ...item, rpe: event.target.value === '' ? null : Math.min(10, Math.max(1, Number(event.target.value) || 1)) } : item,
                                ),
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            aria-label={`Rest seconds for set ${set.setNumber}`}
                            value={set.restSeconds ?? ''}
                            min={0}
                            max={3600}
                            style={{ width: 90 }}
                            onChange={(event) =>
                              updateExercise(exercise.id, {
                                sets: exercise.sets.map((item, i) =>
                                  i === setIndex ? { ...item, restSeconds: event.target.value === '' ? null : Math.max(0, Number(event.target.value) || 0) } : item,
                                ),
                              })
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            aria-label={`Remove set ${set.setNumber}`}
                            onClick={() =>
                              updateExercise(exercise.id, {
                                sets: exercise.sets
                                  .filter((_, i) => i !== setIndex)
                                  .map((item, i) => ({ ...item, setNumber: i + 1 })),
                              })
                            }
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="row" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() =>
                    updateExercise(exercise.id, {
                      sets: [
                        ...exercise.sets,
                        {
                          ...newSet(exercise.sets.length + 1, unit),
                          reps: exercise.sets[exercise.sets.length - 1]?.reps ?? 8,
                          weight: exercise.sets[exercise.sets.length - 1]?.weight ?? 0,
                        },
                      ],
                    })
                  }
                >
                  + Add set
                </button>
                <Badge tone="neutral">Volume {round(exerciseVolume(exercise), 0)} kg</Badge>
                <button
                  type="button"
                  className="btn btn-sm btn-danger right"
                  onClick={() => update({ exercises: draft.exercises.filter((item) => item.id !== exercise.id) })}
                >
                  Remove exercise
                </button>
              </div>
            </div>
          );
        })}

        <button type="button" className="btn" onClick={() => update({ exercises: [...draft.exercises, newExercise(unit)] })}>
          + Add exercise
        </button>

        <div className="grid grid-2">
          <Select
            label="MET preset"
            value={String(draft.met)}
            options={MET_PRESETS.map((preset) => ({ value: String(preset.met), label: `${preset.label} (${preset.met})` }))}
            onChange={(value) => update({ met: Number(value) })}
          />
          <NumberInput label="MET value" value={draft.met} min={1} max={LIMITS.met} step={0.1} onChange={(value) => update({ met: value ?? 1 })} />
        </div>
        <NumberInput
          label="Manual calories (overrides the estimate)"
          suffix="kcal"
          allowEmpty
          value={draft.manualCalories}
          min={0}
          max={LIMITS.calories}
          onChange={(value) => update({ manualCalories: value })}
          hint={`MET estimate: ${metCalories(draft.met, bodyWeightKg, draft.durationMinutes)} kcal - an estimate, using MET × 3.5 × body weight ÷ 200 × minutes.`}
        />
        <Toggle
          label="Already included in another workout or step estimate"
          checked={draft.includedInOtherEstimate}
          onChange={(checked) => update({ includedInOtherEstimate: checked })}
          hint="Keeps this session out of the active-calorie total."
        />
        <TextArea label="Notes" value={draft.notes} onChange={(value) => update({ notes: value })} rows={2} />
        <div className="row small muted">
          <span>Total volume {round(sessionVolume(draft), 0)} kg</span>
          <span>{sessionSetCount(draft)} sets</span>
          <span>Body weight used for estimates: {round(bodyWeightKg, 1)} kg</span>
        </div>
      </div>
    </Modal>
  );
}
