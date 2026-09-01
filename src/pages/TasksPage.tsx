import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppStore';
import { Badge, Card, ConfirmDialog, EmptyState, Modal, NumberInput, Segmented, Select, Stat, TextArea, TextInput, Toggle } from '../components/Ui';
import { PageHero } from '../components/AppShell';
import { StatusStackChart } from '../components/Charts';
import { decorUrl } from '../components/ThemeScope';
import { DEFAULT_TASK_CATEGORIES } from '../db/defaults';
import { RECORD_SCHEMA_VERSION } from '../types/models';
import type { Priority, RecurrenceKind, TaskInstance, TaskTemplate } from '../types/models';
import { addDays, endOfWeek, formatLongDate, formatShortDate, nowInstant, rangeDates, startOfWeek, weekdayName } from '../lib/date';
import { uuid } from '../lib/uuid';
import { applyTemplateToInstance, describeRecurrence } from '../lib/recurrence';
import { computeTaskStats, weeklyTaskAnalysis } from '../lib/calc/tasks';
import { consumeIntent } from '../lib/bus';
import { text as cleanText, multilineText } from '../lib/validate';

type Draft = {
  id: string | null;
  kind: 'instance' | 'template';
  title: string;
  description: string;
  category: string;
  dueTime: string;
  estimatedMinutes: number | null;
  priority: Priority;
  mandatory: boolean;
  notes: string;
  recurrence: RecurrenceKind;
  daysOfWeek: number[];
  intervalDays: number;
  endDate: string;
};

function emptyDraft(): Draft {
  return {
    id: null,
    kind: 'instance',
    title: '',
    description: '',
    category: DEFAULT_TASK_CATEGORIES[0],
    dueTime: '',
    estimatedMinutes: null,
    priority: 'medium',
    mandatory: false,
    notes: '',
    recurrence: 'none',
    daysOfWeek: [1, 2, 3, 4, 5],
    intervalDays: 2,
    endDate: '',
  };
}

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const RECURRENCE_OPTIONS: { value: RecurrenceKind; label: string }[] = [
  { value: 'none', label: 'One-off' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Selected weekdays' },
  { value: 'interval', label: 'Every N days' },
];

export default function TasksPage(): JSX.Element {
  const { data, index, settings, selectedDate, today, actions, notify } = useApp();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [showTemplates, setShowTemplates] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; message: string; run: () => void } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [templateEdit, setTemplateEdit] = useState<TaskTemplate | null>(null);

  useEffect(() => {
    if (consumeIntent(['task'])) setDraft(emptyDraft());
  }, []);

  const dayTasks = useMemo(
    () =>
      [...(index.tasks.get(selectedDate) ?? [])].sort(
        (a, b) => a.order - b.order || (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99'),
      ),
    [index, selectedDate],
  );

  const categories = useMemo(() => {
    const set = new Set<string>(DEFAULT_TASK_CATEGORIES);
    for (const task of data.taskInstances) if (task.category) set.add(task.category);
    for (const template of data.taskTemplates) if (template.category) set.add(template.category);
    return [...set].sort();
  }, [data.taskInstances, data.taskTemplates]);

  const visible = filter === 'all' ? dayTasks : dayTasks.filter((task) => task.category === filter);
  const stats = computeTaskStats(dayTasks, selectedDate, today);
  const mandatoryStats = computeTaskStats(dayTasks.filter((t) => t.mandatory), selectedDate, today);

  const weekDates = rangeDates(startOfWeek(selectedDate, settings.weekStart), endOfWeek(selectedDate, settings.weekStart));
  const weekly = weeklyTaskAnalysis(index.tasks, weekDates, today);

  /* --------------------------------------------------------------- saving */

  async function saveDraft(): Promise<void> {
    if (!draft) return;
    const title = cleanText(draft.title, 120);
    if (!title) {
      setError('Give the task a title.');
      return;
    }
    setError('');
    const now = nowInstant();

    if (draft.recurrence === 'none' && draft.kind === 'instance') {
      const existing = draft.id ? data.taskInstances.find((task) => task.id === draft.id) : null;
      const record: TaskInstance = {
        id: draft.id ?? uuid(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        v: RECORD_SCHEMA_VERSION,
        date: existing?.date ?? selectedDate,
        tz: settings.timeZone,
        templateId: existing?.templateId ?? null,
        title,
        description: multilineText(draft.description, 500),
        category: cleanText(draft.category, 40) || 'Uncategorised',
        dueTime: draft.dueTime || null,
        estimatedMinutes: draft.estimatedMinutes,
        priority: draft.priority,
        mandatory: draft.mandatory,
        notes: multilineText(draft.notes, 1000),
        status: existing?.status ?? 'pending',
        completedAt: existing?.completedAt ?? null,
        order: existing?.order ?? dayTasks.length,
        carriedToDate: existing?.carriedToDate ?? null,
        carriedFromId: existing?.carriedFromId ?? null,
      };
      await actions.putRecord('taskInstances', record);
      notify(draft.id ? 'Task updated.' : 'Task added.', 'success');
    } else {
      const existing = draft.id ? data.taskTemplates.find((template) => template.id === draft.id) : null;
      const template: TaskTemplate = {
        id: draft.id ?? uuid(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        v: RECORD_SCHEMA_VERSION,
        title,
        description: multilineText(draft.description, 500),
        category: cleanText(draft.category, 40) || 'Uncategorised',
        dueTime: draft.dueTime || null,
        estimatedMinutes: draft.estimatedMinutes,
        priority: draft.priority,
        mandatory: draft.mandatory,
        notes: multilineText(draft.notes, 1000),
        recurrence: {
          kind: draft.recurrence,
          daysOfWeek: draft.daysOfWeek,
          intervalDays: Math.max(1, draft.intervalDays),
          startDate: existing?.recurrence.startDate ?? selectedDate,
          endDate: draft.endDate || null,
        },
        archived: existing?.archived ?? false,
        order: existing?.order ?? data.taskTemplates.length,
        tz: settings.timeZone,
      };
      await actions.putRecord('taskTemplates', template);

      if (existing) {
        // Editing a recurring task affects future instances only.
        const future = data.taskInstances.filter(
          (instance) => instance.templateId === template.id && instance.date >= today && instance.status === 'pending',
        );
        if (future.length > 0) {
          await actions.putRecords('taskInstances', future.map((instance) => applyTemplateToInstance(template, instance)));
        }
        notify(`Repeating task updated. ${future.length} upcoming instance(s) refreshed; past records untouched.`, 'success');
      } else {
        notify('Repeating task created.', 'success');
      }
    }
    setDraft(null);
  }

  async function setStatus(task: TaskInstance, status: TaskInstance['status']): Promise<void> {
    await actions.putRecord('taskInstances', {
      ...task,
      status,
      completedAt: status === 'completed' ? nowInstant() : null,
    });
  }

  async function removeTask(task: TaskInstance): Promise<void> {
    if (task.templateId) {
      // Cancel rather than delete so the recurrence does not regenerate it and
      // the historical record stays visible.
      const previous = { ...task };
      await actions.putRecord('taskInstances', { ...task, status: 'cancelled' });
      notify('Task cancelled for this day.', 'info', {
        label: 'Undo',
        run: async () => {
          await actions.putRecord('taskInstances', previous);
        },
      });
    } else {
      await actions.removeRecord('taskInstances', task.id, 'Task');
    }
  }

  async function duplicateTask(task: TaskInstance): Promise<void> {
    const now = nowInstant();
    await actions.putRecord('taskInstances', {
      ...task,
      id: uuid(),
      createdAt: now,
      updatedAt: now,
      templateId: null,
      status: 'pending',
      completedAt: null,
      order: dayTasks.length,
      carriedFromId: null,
      carriedToDate: null,
      title: `${task.title} (copy)`,
    });
    notify('Task duplicated.', 'success');
  }

  async function carryForward(task: TaskInstance): Promise<void> {
    const target = addDays(task.date, 1);
    const now = nowInstant();
    const copy: TaskInstance = {
      ...task,
      id: uuid(),
      createdAt: now,
      updatedAt: now,
      date: target,
      templateId: null,
      status: 'pending',
      completedAt: null,
      carriedFromId: task.id,
      carriedToDate: null,
      order: (index.tasks.get(target) ?? []).length,
    };
    await actions.putRecord('taskInstances', copy);
    // The original stays exactly as it was, keeping the missed record intact.
    await actions.putRecord('taskInstances', { ...task, carriedToDate: target });
    notify(`Carried forward to ${formatShortDate(target)}. The original record for ${formatShortDate(task.date)} is unchanged.`, 'success');
  }

  async function reorder(sourceId: string, targetId: string): Promise<void> {
    if (sourceId === targetId) return;
    const ordered = [...dayTasks];
    const from = ordered.findIndex((task) => task.id === sourceId);
    const to = ordered.findIndex((task) => task.id === targetId);
    if (from === -1 || to === -1) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    await actions.putRecords('taskInstances', ordered.map((task, position) => ({ ...task, order: position })));
  }

  async function move(task: TaskInstance, direction: -1 | 1): Promise<void> {
    const ordered = [...dayTasks];
    const from = ordered.findIndex((item) => item.id === task.id);
    const to = from + direction;
    if (to < 0 || to >= ordered.length) return;
    await reorder(task.id, ordered[to].id);
  }

  /* ---------------------------------------------------------------- render */

  return (
    <div className="page">
      <PageHero
        title="Tasks"
        subtitle={`${formatLongDate(selectedDate)} · ${stats.completed}/${stats.eligible} done`}
        decor={settings.showDecorations ? decorUrl('mascot-leaf-ninja') : undefined}
      />

      <div className="grid grid-4">
        <Stat label="Completed" value={`${stats.completed}/${stats.eligible}`} sub={`${stats.percent}% of eligible tasks`} tone="ok" />
        <Stat
          label="Mandatory"
          value={mandatoryStats.eligible === 0 ? '—' : `${mandatoryStats.completed}/${mandatoryStats.eligible}`}
          sub={mandatoryStats.eligible === 0 ? 'None scheduled' : `${mandatoryStats.percent}% complete`}
          tone={mandatoryStats.percent === 100 && mandatoryStats.eligible > 0 ? 'ok' : 'warn'}
        />
        <Stat label="Missed" value={stats.missed} sub="Skipped or past due" tone={stats.missed > 0 ? 'bad' : undefined} />
        <Stat label="Excused" value={stats.excused} sub="Excluded from the percentage" tone="info" />
      </div>

      <Card
        title="This day"
        subtitle="Drag to reorder, or use the arrow buttons."
        actions={
          <>
            <button type="button" className="btn btn-sm" onClick={() => setShowTemplates(true)}>
              Repeating tasks ({data.taskTemplates.filter((t) => !t.archived).length})
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { setDraft(emptyDraft()); setError(''); }}>
              + Add task
            </button>
          </>
        }
      >
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="tiny strong muted">Filter</span>
          <button type="button" className={`chip ${filter === 'all' ? 'is-active' : ''}`} onClick={() => setFilter('all')}>
            All
          </button>
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={`chip ${filter === category ? 'is-active' : ''}`}
              onClick={() => setFilter(category)}
            >
              {category}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            title="Nothing scheduled here yet"
            action={
              <button type="button" className="btn btn-primary" onClick={() => setDraft(emptyDraft())}>
                Add your first task
              </button>
            }
          >
            Add a one-off task for {formatShortDate(selectedDate)}, or create a repeating task that appears automatically
            on the days you choose.
          </EmptyState>
        ) : (
          <ul className="list">
            {visible.map((task) => (
              <li
                key={task.id}
                className={`item ${task.status === 'completed' ? 'is-done' : ''} ${task.status === 'skipped' ? 'is-missed' : ''} ${
                  task.status === 'excused' ? 'is-excused' : ''
                } ${dragId === task.id ? 'dragging' : ''}`}
                draggable
                onDragStart={() => setDragId(task.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragId) void reorder(dragId, task.id);
                  setDragId(null);
                }}
              >
                <input
                  type="checkbox"
                  checked={task.status === 'completed'}
                  aria-label={`Mark ${task.title} complete`}
                  onChange={(event) => void setStatus(task, event.target.checked ? 'completed' : 'pending')}
                  style={{ marginTop: 4 }}
                />
                <div className="item-main">
                  <div className="item-title">{task.title}</div>
                  {task.description && <div className="small muted">{task.description}</div>}
                  <div className="item-meta">
                    <Badge tone="neutral">{task.category}</Badge>
                    {task.mandatory && <Badge tone="warn">Mandatory</Badge>}
                    {task.priority === 'high' && <Badge tone="bad">High priority</Badge>}
                    {task.dueTime && <span>Due {task.dueTime}</span>}
                    {task.estimatedMinutes ? <span>{task.estimatedMinutes} min</span> : null}
                    {task.templateId && <span>Repeating</span>}
                    {task.status === 'skipped' && <Badge tone="bad">Skipped (counts as missed)</Badge>}
                    {task.status === 'excused' && <Badge tone="warn">Excused</Badge>}
                    {task.status === 'cancelled' && <Badge tone="neutral">Cancelled</Badge>}
                    {task.carriedToDate && <span>Carried to {formatShortDate(task.carriedToDate)}</span>}
                    {task.carriedFromId && <span>Carried forward</span>}
                  </div>
                </div>
                <div className="row-tight" style={{ flexDirection: 'column' }}>
                  <div className="row-tight">
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Move ${task.title} up`} onClick={() => void move(task, -1)}>
                      ↑
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Move ${task.title} down`} onClick={() => void move(task, 1)}>
                      ↓
                    </button>
                  </div>
                  <details>
                    <summary className="btn btn-sm" style={{ listStyle: 'none' }}>
                      Actions
                    </summary>
                    <div className="stack" style={{ marginTop: 6 }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          setDraft({
                            id: task.id,
                            kind: 'instance',
                            title: task.title,
                            description: task.description,
                            category: task.category,
                            dueTime: task.dueTime ?? '',
                            estimatedMinutes: task.estimatedMinutes,
                            priority: task.priority,
                            mandatory: task.mandatory,
                            notes: task.notes,
                            recurrence: 'none',
                            daysOfWeek: [],
                            intervalDays: 1,
                            endDate: '',
                          });
                          setError('');
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => void duplicateTask(task)}>
                        Duplicate
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => void setStatus(task, 'skipped')}>
                        Mark skipped
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => void setStatus(task, 'excused')}>
                        Mark excused
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => void setStatus(task, 'pending')}>
                        Reset to pending
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => void carryForward(task)}>
                        Carry forward a day
                      </button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => void removeTask(task)}>
                        {task.templateId ? 'Cancel for this day' : 'Delete'}
                      </button>
                    </div>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="This week"
        subtitle={`${formatShortDate(weekDates[0])} – ${formatShortDate(weekDates[6])} · totals cover the ${weekly.elapsedDays} day(s) so far`}
      >
        <div className="grid grid-4" style={{ marginBottom: 12 }}>
          <Stat label="Scheduled" value={weekly.totalScheduled} />
          <Stat label="Completed" value={weekly.completed} tone="ok" />
          <Stat label="Missed" value={weekly.missed} tone={weekly.missed > 0 ? 'bad' : undefined} />
          <Stat label="Completion" value={`${weekly.percent}%`} sub={`Mandatory ${weekly.mandatoryPercent}%`} />
        </div>
        <StatusStackChart
          title="Task outcomes by day"
          data={weekDates.map((date) => {
            const dayStats = computeTaskStats(index.tasks.get(date) ?? [], date, today);
            return {
              label: weekdayName(date, true),
              fullLabel: formatShortDate(date),
              completed: dayStats.completed,
              missed: dayStats.missed,
              excused: dayStats.excused,
            };
          })}
        />
        <div className="row small" style={{ marginTop: 8 }}>
          <span>
            Most consistent category:{' '}
            <strong>{weekly.mostConsistent ? `${weekly.mostConsistent.category} (${weekly.mostConsistent.percent}%)` : 'not enough data'}</strong>
          </span>
          <span>
            Least consistent:{' '}
            <strong>{weekly.leastConsistent ? `${weekly.leastConsistent.category} (${weekly.leastConsistent.percent}%)` : 'not enough data'}</strong>
          </span>
        </div>
      </Card>

      {/* ------------------------------------------------------------ modals */}

      {draft && (
        <Modal
          title={draft.id ? 'Edit task' : 'New task'}
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
            <TextInput label="Title" value={draft.title} onChange={(value) => setDraft({ ...draft, title: value })} error={error} required />
            <TextArea label="Description" value={draft.description} onChange={(value) => setDraft({ ...draft, description: value })} rows={2} />
            <div className="grid grid-2">
              <Select
                label="Category"
                value={draft.category}
                options={categories.map((category) => ({ value: category, label: category }))}
                onChange={(value) => setDraft({ ...draft, category: value })}
              />
              <TextInput label="Or a new category" value={draft.category} onChange={(value) => setDraft({ ...draft, category: value })} />
            </div>
            <div className="grid grid-3">
              <TextInput label="Due time" type="time" value={draft.dueTime} onChange={(value) => setDraft({ ...draft, dueTime: value })} />
              <NumberInput
                label="Estimated duration"
                suffix="min"
                value={draft.estimatedMinutes}
                allowEmpty
                min={0}
                max={1440}
                onChange={(value) => setDraft({ ...draft, estimatedMinutes: value })}
              />
              <Select label="Priority" value={draft.priority} options={PRIORITY_OPTIONS} onChange={(value) => setDraft({ ...draft, priority: value })} />
            </div>
            <Toggle
              label="Mandatory"
              checked={draft.mandatory}
              onChange={(checked) => setDraft({ ...draft, mandatory: checked })}
              hint="Mandatory tasks get their own completion figure and can be required for a successful day."
            />

            {draft.kind === 'instance' && !draft.id && (
              <>
                <Select
                  label="Repeat"
                  value={draft.recurrence}
                  options={RECURRENCE_OPTIONS}
                  onChange={(value) => setDraft({ ...draft, recurrence: value })}
                  hint="Repeating tasks create a dated instance on each matching day."
                />
                {(draft.recurrence === 'weekdays' || draft.recurrence === 'weekly') && (
                  <div className="field">
                    <span className="field-label">Days</span>
                    <div className="row">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, dayIndex) => (
                        <button
                          key={day}
                          type="button"
                          className="chip"
                          aria-pressed={draft.daysOfWeek.includes(dayIndex)}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              daysOfWeek: draft.daysOfWeek.includes(dayIndex)
                                ? draft.daysOfWeek.filter((d) => d !== dayIndex)
                                : [...draft.daysOfWeek, dayIndex],
                            })
                          }
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {draft.recurrence === 'interval' && (
                  <NumberInput
                    label="Repeat every"
                    suffix="days"
                    value={draft.intervalDays}
                    min={1}
                    max={365}
                    onChange={(value) => setDraft({ ...draft, intervalDays: value ?? 1 })}
                  />
                )}
                {draft.recurrence !== 'none' && (
                  <TextInput label="Stop repeating after (optional)" type="date" value={draft.endDate} onChange={(value) => setDraft({ ...draft, endDate: value })} />
                )}
              </>
            )}

            <TextArea label="Notes" value={draft.notes} onChange={(value) => setDraft({ ...draft, notes: value })} rows={2} />
          </div>
        </Modal>
      )}

      {showTemplates && (
        <Modal title="Repeating tasks" onClose={() => setShowTemplates(false)} wide>
          {data.taskTemplates.length === 0 ? (
            <EmptyState title="No repeating tasks yet">
              Create a task and choose a repeat pattern to have it appear automatically on the days you pick.
            </EmptyState>
          ) : (
            <ul className="list">
              {data.taskTemplates.map((template) => (
                <li key={template.id} className="item">
                  <div className="item-main">
                    <div className="item-title">{template.title}</div>
                    <div className="item-meta">
                      <Badge tone="neutral">{template.category}</Badge>
                      <span>{describeRecurrence(template.recurrence)}</span>
                      {template.mandatory && <Badge tone="warn">Mandatory</Badge>}
                      {template.archived && <Badge tone="neutral">Archived</Badge>}
                    </div>
                  </div>
                  <div className="row-tight">
                    <button type="button" className="btn btn-sm" onClick={() => setTemplateEdit(template)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => void actions.putRecord('taskTemplates', { ...template, archived: !template.archived })}
                    >
                      {template.archived ? 'Restore' : 'Archive'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() =>
                        setConfirm({
                          title: 'Delete repeating task?',
                          message:
                            'The template is removed and no new instances are created. Dated instances already recorded stay in your history exactly as they are.',
                          run: () => {
                            void actions.removeRecord('taskTemplates', template.id, 'Repeating task');
                            setConfirm(null);
                          },
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {templateEdit && (
        <Modal
          title="Edit repeating task"
          onClose={() => setTemplateEdit(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setTemplateEdit(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  await actions.putRecord('taskTemplates', templateEdit);
                  const future = data.taskInstances.filter(
                    (instance) => instance.templateId === templateEdit.id && instance.date >= today && instance.status === 'pending',
                  );
                  await actions.putRecords('taskInstances', future.map((instance) => applyTemplateToInstance(templateEdit, instance)));
                  notify(`Updated. ${future.length} upcoming instance(s) refreshed; past records untouched.`, 'success');
                  setTemplateEdit(null);
                }}
              >
                Save (future only)
              </button>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  await actions.putRecord('taskTemplates', templateEdit);
                  const all = data.taskInstances.filter((instance) => instance.templateId === templateEdit.id);
                  await actions.putRecords('taskInstances', all.map((instance) => applyTemplateToInstance(templateEdit, instance)));
                  notify(`Updated ${all.length} instance(s), including past records.`, 'warning');
                  setTemplateEdit(null);
                }}
              >
                Also update past records
              </button>
            </>
          }
        >
          <div className="stack">
            <div className="note-banner">
              By default an edit applies to future instances only, so past days keep the exact record you had at the time.
            </div>
            <TextInput label="Title" value={templateEdit.title} onChange={(value) => setTemplateEdit({ ...templateEdit, title: value })} />
            <div className="grid grid-3">
              <TextInput label="Category" value={templateEdit.category} onChange={(value) => setTemplateEdit({ ...templateEdit, category: value })} />
              <TextInput
                label="Due time"
                type="time"
                value={templateEdit.dueTime ?? ''}
                onChange={(value) => setTemplateEdit({ ...templateEdit, dueTime: value || null })}
              />
              <Select
                label="Priority"
                value={templateEdit.priority}
                options={PRIORITY_OPTIONS}
                onChange={(value) => setTemplateEdit({ ...templateEdit, priority: value })}
              />
            </div>
            <Segmented
              label="Repeat pattern"
              value={templateEdit.recurrence.kind}
              options={RECURRENCE_OPTIONS}
              onChange={(value) => setTemplateEdit({ ...templateEdit, recurrence: { ...templateEdit.recurrence, kind: value } })}
            />
            {(templateEdit.recurrence.kind === 'weekdays' || templateEdit.recurrence.kind === 'weekly') && (
              <div className="row">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, dayIndex) => (
                  <button
                    key={day}
                    type="button"
                    className="chip"
                    aria-pressed={templateEdit.recurrence.daysOfWeek.includes(dayIndex)}
                    onClick={() =>
                      setTemplateEdit({
                        ...templateEdit,
                        recurrence: {
                          ...templateEdit.recurrence,
                          daysOfWeek: templateEdit.recurrence.daysOfWeek.includes(dayIndex)
                            ? templateEdit.recurrence.daysOfWeek.filter((d) => d !== dayIndex)
                            : [...templateEdit.recurrence.daysOfWeek, dayIndex],
                        },
                      })
                    }
                  >
                    {day}
                  </button>
                ))}
              </div>
            )}
            <Toggle label="Mandatory" checked={templateEdit.mandatory} onChange={(checked) => setTemplateEdit({ ...templateEdit, mandatory: checked })} />
          </div>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog title={confirm.title} message={confirm.message} onConfirm={confirm.run} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
