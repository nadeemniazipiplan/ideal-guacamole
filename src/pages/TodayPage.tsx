import { useMemo } from 'react';
import { useApp } from '../state/AppStore';
import { Badge, Card, EmptyState, ProgressRing, Stat } from '../components/Ui';
import { PageHero } from '../components/AppShell';
import { decorUrl } from '../components/ThemeScope';
import { addDays, formatLongDate, formatShortDate, localTime, rangeDates } from '../lib/date';
import { computeStreaks, evaluateDay } from '../lib/calc/streak';
import { METHOD_EXPLANATIONS } from '../lib/calc/energy';
import { dayScore } from '../lib/analytics';
import { round } from '../lib/validate';
import { setIntent } from '../lib/bus';
import { PAGES } from '../router';
import type { PageKey } from '../types/models';

function greeting(timeZone: string, name: string): string {
  const hour = Number(localTime(timeZone).slice(0, 2));
  const part = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 22 ? 'Good evening' : 'Winding down';
  return name ? `${part}, ${name}` : part;
}

function go(page: PageKey, intent?: Parameters<typeof setIntent>[0]): void {
  if (intent) setIntent(intent);
  window.location.hash = `#/${page}`;
}

export default function TodayPage(): JSX.Element {
  const { settings, selectedDate, today, summaryFor, firstDate, data } = useApp();
  const summary = summaryFor(selectedDate);
  const evaluation = evaluateDay(summary, settings, today);

  const streak = useMemo(() => {
    const from = firstDate && firstDate < addDays(today, -365) ? addDays(today, -365) : (firstDate ?? today);
    const evaluations = rangeDates(from, today).map((date) => evaluateDay(summaryFor(date), settings, today));
    return computeStreaks(evaluations, today);
  }, [firstDate, today, summaryFor, settings]);

  const overall = dayScore(summary);
  const overdue = summary.taskList.filter(
    (task) => task.status === 'pending' && task.dueTime !== null && (selectedDate < today || task.dueTime < localTime(settings.timeZone)),
  );
  const remaining = summary.taskList.filter((task) => task.status === 'pending');

  const hasAnythingAtAll =
    data.taskInstances.length > 0 || data.foodEntries.length > 0 || data.gymSessions.length > 0 ||
    data.runSessions.length > 0 || data.stepEntries.length > 0 || data.studySessions.length > 0;

  const review: string[] = [];
  if (summary.tasks.all.eligible > 0) {
    review.push(`${summary.tasks.all.completed} of ${summary.tasks.all.eligible} tasks completed (${summary.tasks.all.percent}%).`);
  }
  if (summary.nutrition.calories > 0) {
    review.push(
      `${round(summary.nutrition.calories, 0)} kcal logged against a ${summary.targets.calories} kcal target, with ${round(summary.nutrition.protein, 0)} g protein.`,
    );
  }
  if (summary.active.total > 0) review.push(`${summary.active.total} kcal of estimated active energy from what you logged.`);
  if (summary.stepCount > 0) review.push(`${summary.stepCount.toLocaleString()} steps of a ${summary.targets.steps.toLocaleString()} step target.`);
  if (summary.studyTotals.minutes > 0) review.push(`${summary.studyTotals.minutes} study minutes of a ${summary.targets.studyMinutes} minute target.`);
  if (summary.gym.length > 0) review.push(`${summary.gym.length} gym session(s) totalling ${round(summary.trainingVolumeKg, 0)} kg of volume.`);
  if (summary.runs.length > 0) review.push(`${round(summary.runDistanceKm, 2)} km run in ${summary.runDurationMinutes} minutes.`);

  return (
    <div className="page">
      <PageHero
        title={greeting(settings.timeZone, settings.displayName)}
        subtitle={formatLongDate(selectedDate)}
        decor={settings.showDecorations ? decorUrl('mascot-spark') : undefined}
      >
        <div className="row" style={{ marginTop: 10 }}>
          <Badge tone="ok">
            {streak.current} day streak
          </Badge>
          <Badge tone="neutral">Longest {streak.longest}</Badge>
          {selectedDate !== today && <Badge tone="warn">Viewing a past date</Badge>}
        </div>
      </PageHero>

      {!hasAnythingAtAll && (
        <EmptyState
          title="Let's set this up"
          action={
            <div className="row" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={() => go('tasks', 'task')}>
                Add a task
              </button>
              <button type="button" className="btn" onClick={() => go('settings')}>
                Set your targets
              </button>
            </div>
          }
        >
          Nothing is recorded yet. Add your first task, log a meal, or set your daily targets in Settings - everything is
          stored on this device only.
        </EmptyState>
      )}

      <Card title="Day progress" subtitle="An average of the targets you have data for on this day.">
        <div className="ring-wrap">
          <ProgressRing
            percent={overall}
            label="Overall day progress"
            caption={
              evaluation.outcome === 'success'
                ? 'Every success condition you switched on has been met.'
                : evaluation.outcome === 'rest'
                  ? 'Planned rest day - it counts towards your streak.'
                  : evaluation.outcome === 'future'
                    ? 'This day has not happened yet.'
                    : evaluation.reason
            }
          />
          <div className="grid grid-2" style={{ flex: 1, minWidth: 220 }}>
            <Stat
              label="Tasks"
              value={`${summary.tasks.all.completed}/${summary.tasks.all.eligible}`}
              sub={`${summary.tasks.all.percent}% · mandatory ${summary.tasks.mandatory.percent}%`}
              onClick={() => go('tasks')}
            />
            <Stat
              label="Calories"
              value={round(summary.nutrition.calories, 0)}
              sub={
                summary.nutritionProgress.calories.remaining >= 0
                  ? `of ${summary.targets.calories} kcal · ${round(summary.nutritionProgress.calories.remaining, 0)} left`
                  : `of ${summary.targets.calories} kcal · ${round(-summary.nutritionProgress.calories.remaining, 0)} over`
              }
              onClick={() => go('nutrition')}
            />
            <Stat
              label="Estimated burn"
              value={`${summary.active.total} kcal`}
              sub={summary.active.excluded > 0 ? `${summary.active.excluded} kcal excluded as duplicates` : 'From logged exercise'}
              onClick={() => go('fitness')}
            />
            <Stat
              label={summary.energy.balance >= 0 ? 'Estimated deficit' : 'Estimated surplus'}
              value={summary.nutrition.calories > 0 ? `${summary.energy.magnitude} kcal` : '—'}
              sub={summary.nutrition.calories > 0 ? summary.energy.methodLabel : 'Log food to see an estimate'}
              tone={summary.nutrition.calories > 0 ? (summary.energy.balance >= 0 ? 'ok' : 'warn') : undefined}
              onClick={() => go('settings')}
            />
          </div>
        </div>
      </Card>

      <div className="grid grid-4">
        <Stat label="Steps" value={summary.stepCount.toLocaleString()} sub={`Target ${summary.targets.steps.toLocaleString()}`} onClick={() => go('fitness', 'steps')} />
        <Stat
          label="Training"
          value={summary.gym.length}
          sub={`session(s) · ${round(summary.trainingVolumeKg, 0)} kg volume`}
          onClick={() => go('fitness', 'gym')}
        />
        <Stat
          label="Running"
          value={`${round(summary.runDistanceKm, 2)} km`}
          sub={`${summary.runDurationMinutes} minutes`}
          onClick={() => go('fitness', 'run')}
        />
        <Stat label="Study" value={`${summary.studyTotals.minutes} min`} sub={`Target ${summary.targets.studyMinutes} min`} onClick={() => go('study', 'study')} />
      </div>

      <div className="grid grid-2">
        <Card title="Still to do" headingLevel={2}>
          {remaining.length === 0 ? (
            <p className="small muted">
              {summary.taskList.length === 0
                ? 'No tasks are scheduled for this day yet.'
                : 'Everything scheduled for this day is done or accounted for.'}
            </p>
          ) : (
            <ul className="list">
              {remaining.slice(0, 8).map((task) => (
                <li key={task.id} className="item">
                  <div className="item-main">
                    <div className="item-title">{task.title}</div>
                    <div className="item-meta">
                      <Badge tone="neutral">{task.category}</Badge>
                      {task.mandatory && <Badge tone="warn">Mandatory</Badge>}
                      {task.dueTime && <span>Due {task.dueTime}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {overdue.length > 0 && (
            <div className="note-banner warn" style={{ marginTop: 10 }}>
              {overdue.length} task(s) are past their due time: {overdue.slice(0, 3).map((task) => task.title).join(', ')}
              {overdue.length > 3 ? '…' : ''}
            </div>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-sm" onClick={() => go('tasks', 'task')}>
              + Task
            </button>
            <button type="button" className="btn btn-sm" onClick={() => go('nutrition', 'food')}>
              + Food
            </button>
            <button type="button" className="btn btn-sm" onClick={() => go('fitness', 'gym')}>
              + Workout
            </button>
            <button type="button" className="btn btn-sm" onClick={() => go('fitness', 'run')}>
              + Run
            </button>
            <button type="button" className="btn btn-sm" onClick={() => go('fitness', 'steps')}>
              + Steps
            </button>
            <button type="button" className="btn btn-sm" onClick={() => go('study', 'study')}>
              + Study
            </button>
          </div>
        </Card>

        <Card title="Daily review" subtitle="Built only from what is stored for this date.">
          {review.length === 0 ? (
            <p className="small muted">
              Nothing has been recorded for {formatShortDate(selectedDate)} yet. Add an entry with the buttons on the left
              or the + button, and this review fills itself in.
            </p>
          ) : (
            <ul className="review-list small">
              {review.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <p className="tiny muted" style={{ marginTop: 10 }}>
            {METHOD_EXPLANATIONS[summary.energy.method]} All energy figures are estimates.
          </p>
        </Card>
      </div>

      <Card title="Jump to" className="no-print">
        <div className="row">
          {PAGES.filter((page) => page.key !== 'today').map((page) => (
            <button key={page.key} type="button" className="chip" onClick={() => go(page.key)}>
              <span aria-hidden="true">{page.icon}</span>
              {page.label}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
