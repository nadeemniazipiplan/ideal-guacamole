import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppStore';
import {
  Badge, Card, EmptyState, Modal, NumberInput, ProgressBar, Select, Stat, TextArea, TextInput,
} from '../components/Ui';
import { PageHero } from '../components/AppShell';
import { BarChart, RankedBarChart } from '../components/Charts';
import { decorUrl } from '../components/ThemeScope';
import { SUBJECT_COLOURS } from '../db/defaults';
import { RECORD_SCHEMA_VERSION } from '../types/models';
import type { Chapter, StudySession, StudyStatus, Subject } from '../types/models';
import { endOfWeek, formatDuration, formatLongDate, formatShortDate, nowInstant, rangeDates, startOfWeek, weekdayName } from '../lib/date';
import { uuid } from '../lib/uuid';
import { formatStopwatch, studyTotals, subjectProgress, timerElapsedMs, weeklyStudyAnalysis } from '../lib/calc/study';
import { targetsForDate } from '../lib/calc/targets';
import { consumeIntent } from '../lib/bus';
import { LIMITS, text as cleanText } from '../lib/validate';

interface SessionDraft {
  id: string | null;
  subjectId: string;
  chapterId: string;
  topic: string;
  plannedMinutes: number;
  actualMinutes: number;
  startTime: string;
  endTime: string;
  status: StudyStatus;
  confidence: number | null;
  revisionDate: string;
  notes: string;
}

function emptyDraft(subjectId: string): SessionDraft {
  return {
    id: null, subjectId, chapterId: '', topic: '', plannedMinutes: 60, actualMinutes: 60,
    startTime: '', endTime: '', status: 'completed', confidence: 3, revisionDate: '', notes: '',
  };
}

export default function StudyPage(): JSX.Element {
  const { data, index, settings, selectedDate, today, actions, notify } = useApp();
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [error, setError] = useState('');
  const [subjectDraft, setSubjectDraft] = useState<Subject | null>(null);
  const [chapterName, setChapterName] = useState('');
  const [chapterSubject, setChapterSubject] = useState('');
  const [tick, setTick] = useState(0);

  const subjects = data.subjects.filter((subject) => !subject.archived);
  const timer = data.studyTimer;

  useEffect(() => {
    if (consumeIntent(['study']) && subjects.length > 0) setDraft(emptyDraft(subjects[0].id));
    // Intent is a one-shot hand-off from the quick-add control.

  }, []);

  // Re-render once a second while the timer runs. The displayed value is always
  // derived from stored timestamps, so a paused tab loses nothing.
  useEffect(() => {
    if (!timer.active || !timer.running) return undefined;
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [timer.active, timer.running]);
  void tick;

  const elapsedMs = timerElapsedMs(timer);
  const sessions = index.study.get(selectedDate) ?? [];
  const totals = studyTotals(sessions);
  const targets = targetsForDate(data.targetVersions, selectedDate);
  const progress = subjectProgress(data.subjects, data.chapters);

  const weekDates = rangeDates(startOfWeek(selectedDate, settings.weekStart), endOfWeek(selectedDate, settings.weekStart));
  const weekly = useMemo(
    () =>
      weeklyStudyAnalysis(
        index.study,
        weekDates,
        data.subjects,
        data.chapters,
        (date) => targetsForDate(data.targetVersions, date).studyMinutes,
        today,
      ),
    [index.study, weekDates, data.subjects, data.chapters, data.targetVersions, today],
  );

  async function saveSubject(subject: Subject): Promise<void> {
    await actions.putRecord('subjects', subject);
    setSubjectDraft(null);
    notify('Subject saved.', 'success');
  }

  async function saveDraft(): Promise<void> {
    if (!draft) return;
    if (!draft.subjectId) {
      setError('Choose a subject first.');
      return;
    }
    setError('');
    const now = nowInstant();
    const existing = draft.id ? data.studySessions.find((session) => session.id === draft.id) : null;
    const record: StudySession = {
      id: draft.id ?? uuid(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      v: RECORD_SCHEMA_VERSION,
      date: existing?.date ?? selectedDate,
      tz: settings.timeZone,
      subjectId: draft.subjectId,
      chapterId: draft.chapterId || null,
      topic: cleanText(draft.topic, 100),
      plannedMinutes: Math.max(0, Math.round(draft.plannedMinutes)),
      actualMinutes: Math.max(0, Math.round(draft.actualMinutes)),
      startTime: draft.startTime || null,
      endTime: draft.endTime || null,
      status: draft.status,
      confidence: draft.confidence,
      revisionDate: draft.revisionDate || null,
      notes: cleanText(draft.notes, 500),
    };
    await actions.putRecord('studySessions', record);
    notify(draft.id ? 'Study session updated.' : 'Study session saved.', 'success');
    setDraft(null);
  }

  return (
    <div className="page">
      <PageHero
        title="Study"
        subtitle={`${formatLongDate(selectedDate)} · ${totals.minutes} of ${targets.studyMinutes} minutes`}
        decor={settings.showDecorations ? decorUrl('mascot-grimoire') : undefined}
      />

      <Card title="Study timer" subtitle="Elapsed time is calculated from stored timestamps, so backgrounding the app or reloading never loses time.">
        {timer.active ? (
          <div className="stack">
            <div className="row">
              <span className="stat-value" style={{ fontSize: '2.2rem' }} role="timer" aria-live="off">
                {formatStopwatch(elapsedMs)}
              </span>
              <Badge tone={timer.running ? 'ok' : 'warn'}>{timer.running ? 'Running' : 'Paused'}</Badge>
              <span className="muted small">
                {data.subjects.find((subject) => subject.id === timer.subjectId)?.name ?? 'No subject'}
                {timer.topic ? ` · ${timer.topic}` : ''}
              </span>
            </div>
            <div className="row">
              {timer.running ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void actions.saveTimer({ ...timer, running: false, accumulatedMs: timerElapsedMs(timer), startedAt: null })
                  }
                >
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={() => void actions.saveTimer({ ...timer, running: true, startedAt: nowInstant() })}
                >
                  Resume
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  const minutes = Math.max(1, Math.round(timerElapsedMs(timer) / 60000));
                  setDraft({
                    ...emptyDraft(timer.subjectId ?? subjects[0]?.id ?? ''),
                    chapterId: timer.chapterId ?? '',
                    topic: timer.topic,
                    plannedMinutes: minutes,
                    actualMinutes: minutes,
                  });
                  await actions.saveTimer({ ...timer, active: false, running: false, accumulatedMs: 0, startedAt: null });
                }}
              >
                Finish and log
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void actions.saveTimer({ ...timer, active: false, running: false, accumulatedMs: 0, startedAt: null, topic: '' })}
              >
                Discard
              </button>
            </div>
          </div>
        ) : subjects.length === 0 ? (
          <EmptyState title="Add a subject to start the timer">
            Subjects group your sessions and give you a colour-coded progress bar.
          </EmptyState>
        ) : (
          <StartTimer
            subjects={subjects}
            chapters={data.chapters}
            onStart={(subjectId, chapterId, topic) =>
              void actions.saveTimer({
                ...timer,
                active: true,
                running: true,
                subjectId,
                chapterId: chapterId || null,
                topic,
                startedAt: nowInstant(),
                accumulatedMs: 0,
              })
            }
          />
        )}
      </Card>

      <div className="grid grid-4">
        <Stat label="Minutes today" value={totals.minutes} sub={`Target ${targets.studyMinutes} min`} tone={totals.minutes >= targets.studyMinutes ? 'ok' : undefined} />
        <Stat label="Sessions" value={totals.sessions} sub={`${totals.completedSessions} completed`} />
        <Stat label="Average confidence" value={totals.averageConfidence ?? '—'} sub="1 (shaky) to 5 (solid)" />
        <Stat label="Week total" value={formatDuration(weekly.totalMinutes)} sub={`${weekly.adherencePct}% of the target for the ${weekly.elapsedDays} day(s) so far`} />
      </div>

      <Card
        title="Sessions"
        subtitle={formatShortDate(selectedDate)}
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={subjects.length === 0}
            onClick={() => { setDraft(emptyDraft(subjects[0]?.id ?? '')); setError(''); }}
          >
            + Log session
          </button>
        }
      >
        {sessions.length === 0 ? (
          <EmptyState title="No study logged for this day">
            Use the timer above, or log a session by hand with its subject, topic and minutes.
          </EmptyState>
        ) : (
          <ul className="list">
            {sessions.map((session) => {
              const subject = data.subjects.find((item) => item.id === session.subjectId);
              const chapter = data.chapters.find((item) => item.id === session.chapterId);
              return (
                <li key={session.id} className="item">
                  <span
                    aria-hidden="true"
                    style={{ width: 10, height: 10, borderRadius: 4, marginTop: 7, background: subject?.colour ?? '#94A3B8', flex: '0 0 auto' }}
                  />
                  <div className="item-main">
                    <div className="item-title">
                      {subject?.name ?? 'Removed subject'}
                      {session.topic ? ` · ${session.topic}` : ''}
                    </div>
                    <div className="item-meta">
                      <span>{session.actualMinutes} min</span>
                      <span>planned {session.plannedMinutes} min</span>
                      {chapter && <span>{chapter.name}</span>}
                      {session.startTime && <span>{session.startTime}{session.endTime ? `–${session.endTime}` : ''}</span>}
                      <Badge tone={session.status === 'completed' ? 'ok' : session.status === 'skipped' ? 'bad' : 'neutral'}>{session.status}</Badge>
                      {session.confidence !== null && <span>Confidence {session.confidence}/5</span>}
                      {session.revisionDate && <span>Revise {formatShortDate(session.revisionDate)}</span>}
                    </div>
                    {session.notes && <div className="small muted">{session.notes}</div>}
                  </div>
                  <div className="row-tight">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        setDraft({
                          id: session.id,
                          subjectId: session.subjectId,
                          chapterId: session.chapterId ?? '',
                          topic: session.topic,
                          plannedMinutes: session.plannedMinutes,
                          actualMinutes: session.actualMinutes,
                          startTime: session.startTime ?? '',
                          endTime: session.endTime ?? '',
                          status: session.status,
                          confidence: session.confidence,
                          revisionDate: session.revisionDate ?? '',
                          notes: session.notes,
                        })
                      }
                    >
                      Edit
                    </button>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => void actions.removeRecord('studySessions', session.id, 'Study session')}>
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card
        title="Subjects and chapters"
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              const now = nowInstant();
              setSubjectDraft({
                id: uuid(), createdAt: now, updatedAt: now, v: RECORD_SCHEMA_VERSION,
                name: '', colour: SUBJECT_COLOURS[data.subjects.length % SUBJECT_COLOURS.length], archived: false,
              });
            }}
          >
            + Add subject
          </button>
        }
      >
        {subjects.length === 0 ? (
          <EmptyState title="No subjects yet">Add a subject, then add its chapters or topics to track completion.</EmptyState>
        ) : (
          <div className="stack">
            {progress.map((item) => {
              const chapters = data.chapters.filter((chapter) => chapter.subjectId === item.subjectId).sort((a, b) => a.order - b.order);
              return (
                <div key={item.subjectId} className="card" style={{ background: 'var(--card-2)' }}>
                  <div className="row">
                    <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 4, background: item.colour }} />
                    <strong>{item.name}</strong>
                    <Badge tone="neutral">
                      {item.completedChapters}/{item.totalChapters} chapters
                    </Badge>
                    <span className="right row-tight">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setSubjectDraft(data.subjects.find((subject) => subject.id === item.subjectId) ?? null)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => void actions.removeRecord('subjects', item.subjectId, 'Subject')}
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <ProgressBar label={`${item.name} chapters`} value={item.completedChapters} target={Math.max(1, item.totalChapters)} />
                  </div>
                  <ul className="list" style={{ marginTop: 8 }}>
                    {chapters.map((chapter) => (
                      <li key={chapter.id} className={`item ${chapter.completed ? 'is-done' : ''}`}>
                        <input
                          type="checkbox"
                          checked={chapter.completed}
                          aria-label={`Mark ${chapter.name} complete`}
                          onChange={(event) =>
                            void actions.putRecord('chapters', {
                              ...chapter,
                              completed: event.target.checked,
                              completedDate: event.target.checked ? selectedDate : null,
                            })
                          }
                        />
                        <div className="item-main">
                          <div className="item-title">{chapter.name}</div>
                          {chapter.completedDate && <div className="item-meta"><span>Completed {formatShortDate(chapter.completedDate)}</span></div>}
                        </div>
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => void actions.removeRecord('chapters', chapter.id, 'Chapter')}>
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="row" style={{ marginTop: 8 }}>
                    <input
                      type="text"
                      placeholder="New chapter or topic"
                      aria-label={`New chapter for ${item.name}`}
                      maxLength={100}
                      value={chapterSubject === item.subjectId ? chapterName : ''}
                      onChange={(event) => {
                        setChapterSubject(item.subjectId);
                        setChapterName(event.target.value);
                      }}
                      style={{ maxWidth: 280 }}
                    />
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={async () => {
                        const name = cleanText(chapterName, 100);
                        if (!name || chapterSubject !== item.subjectId) return;
                        const now = nowInstant();
                        const chapter: Chapter = {
                          id: uuid(), createdAt: now, updatedAt: now, v: RECORD_SCHEMA_VERSION,
                          subjectId: item.subjectId, name, completed: false, completedDate: null, order: chapters.length,
                        };
                        await actions.putRecord('chapters', chapter);
                        setChapterName('');
                      }}
                    >
                      Add chapter
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="This week" subtitle={`${formatShortDate(weekDates[0])} – ${formatShortDate(weekDates[6])}`}>
        <div className="grid grid-4" style={{ marginBottom: 12 }}>
          <Stat label="Total" value={formatDuration(weekly.totalMinutes)} />
          <Stat label="Daily average" value={`${weekly.averageDailyMinutes} min`} />
          <Stat label="Chapters completed" value={weekly.completedChapters} />
          <Stat
            label="Strongest day"
            value={weekly.strongestDay ? weekdayName(weekly.strongestDay.date, true) : '—'}
            sub={weekly.strongestDay ? `${weekly.strongestDay.minutes} min` : 'Nothing logged'}
          />
        </div>
        <BarChart
          title="Study minutes by day"
          unit=" min"
          target={targets.studyMinutes}
          targetLabel="Daily target"
          data={weekly.byDay.map((day) => ({ label: weekdayName(day.date, true), fullLabel: formatShortDate(day.date), value: day.minutes }))}
        />
        <div style={{ marginTop: 12 }}>
          <RankedBarChart
            title="Minutes by subject"
            unit=" min"
            data={weekly.distribution.map((item) => ({ label: item.name, value: item.minutes }))}
          />
        </div>
      </Card>

      {/* --------------------------------------------------------- modals */}

      {subjectDraft && (
        <Modal
          title={data.subjects.some((subject) => subject.id === subjectDraft.id) ? 'Edit subject' : 'New subject'}
          onClose={() => setSubjectDraft(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setSubjectDraft(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!cleanText(subjectDraft.name, 60)}
                onClick={() => void saveSubject({ ...subjectDraft, name: cleanText(subjectDraft.name, 60) })}
              >
                Save
              </button>
            </>
          }
        >
          <div className="stack">
            <TextInput label="Subject name" value={subjectDraft.name} onChange={(value) => setSubjectDraft({ ...subjectDraft, name: value })} />
            <div className="field">
              <span className="field-label">Colour</span>
              <div className="row">
                {SUBJECT_COLOURS.map((colour) => (
                  <button
                    key={colour}
                    type="button"
                    className="chip"
                    aria-pressed={subjectDraft.colour === colour}
                    aria-label={`Colour ${colour}`}
                    onClick={() => setSubjectDraft({ ...subjectDraft, colour })}
                  >
                    <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 5, background: colour, display: 'inline-block' }} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {draft && (
        <Modal
          title={draft.id ? 'Edit study session' : 'Log study session'}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void saveDraft()}>
                Save
              </button>
            </>
          }
        >
          <div className="stack">
            <Select
              label="Subject"
              value={draft.subjectId}
              options={subjects.map((subject) => ({ value: subject.id, label: subject.name }))}
              onChange={(value) => setDraft({ ...draft, subjectId: value, chapterId: '' })}
            />
            {error && <span className="error-text" role="alert">{error}</span>}
            <Select
              label="Chapter (optional)"
              value={draft.chapterId}
              options={[
                { value: '', label: 'No chapter' },
                ...data.chapters.filter((chapter) => chapter.subjectId === draft.subjectId).map((chapter) => ({ value: chapter.id, label: chapter.name })),
              ]}
              onChange={(value) => setDraft({ ...draft, chapterId: value })}
            />
            <TextInput label="Topic" value={draft.topic} onChange={(value) => setDraft({ ...draft, topic: value })} />
            <div className="grid grid-2">
              <NumberInput label="Planned" suffix="min" value={draft.plannedMinutes} min={0} max={LIMITS.minutes} onChange={(value) => setDraft({ ...draft, plannedMinutes: value ?? 0 })} />
              <NumberInput label="Actual" suffix="min" value={draft.actualMinutes} min={0} max={LIMITS.minutes} onChange={(value) => setDraft({ ...draft, actualMinutes: value ?? 0 })} />
              <TextInput label="Start time" type="time" value={draft.startTime} onChange={(value) => setDraft({ ...draft, startTime: value })} />
              <TextInput label="End time" type="time" value={draft.endTime} onChange={(value) => setDraft({ ...draft, endTime: value })} />
            </div>
            <div className="grid grid-2">
              <Select
                label="Status"
                value={draft.status}
                options={[
                  { value: 'completed' as StudyStatus, label: 'Completed' },
                  { value: 'partial' as StudyStatus, label: 'Partial' },
                  { value: 'planned' as StudyStatus, label: 'Planned' },
                  { value: 'skipped' as StudyStatus, label: 'Skipped' },
                ]}
                onChange={(value) => setDraft({ ...draft, status: value })}
              />
              <Select
                label="Confidence"
                value={String(draft.confidence ?? '')}
                options={[
                  { value: '', label: 'Not rated' },
                  { value: '1', label: '1 - shaky' },
                  { value: '2', label: '2' },
                  { value: '3', label: '3 - okay' },
                  { value: '4', label: '4' },
                  { value: '5', label: '5 - solid' },
                ]}
                onChange={(value) => setDraft({ ...draft, confidence: value === '' ? null : Number(value) })}
              />
            </div>
            <TextInput label="Revision date (optional)" type="date" value={draft.revisionDate} onChange={(value) => setDraft({ ...draft, revisionDate: value })} />
            <TextArea label="Notes" value={draft.notes} onChange={(value) => setDraft({ ...draft, notes: value })} rows={2} />
          </div>
        </Modal>
      )}
    </div>
  );
}

function StartTimer({
  subjects,
  chapters,
  onStart,
}: {
  subjects: Subject[];
  chapters: Chapter[];
  onStart: (subjectId: string, chapterId: string, topic: string) => void;
}): JSX.Element {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [chapterId, setChapterId] = useState('');
  const [topic, setTopic] = useState('');
  return (
    <div className="grid grid-2">
      <Select label="Subject" value={subjectId} options={subjects.map((subject) => ({ value: subject.id, label: subject.name }))} onChange={setSubjectId} />
      <Select
        label="Chapter (optional)"
        value={chapterId}
        options={[{ value: '', label: 'No chapter' }, ...chapters.filter((chapter) => chapter.subjectId === subjectId).map((chapter) => ({ value: chapter.id, label: chapter.name }))]}
        onChange={setChapterId}
      />
      <TextInput label="Topic" value={topic} onChange={setTopic} />
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => onStart(subjectId, chapterId, cleanText(topic, 100))}>
          Start timer
        </button>
      </div>
    </div>
  );
}
