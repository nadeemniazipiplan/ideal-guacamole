import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppStore';
import { Card, SectionTabs } from '../components/Ui';
import { PageHero } from '../components/AppShell';
import { DayDetail } from '../components/DayDetail';
import { decorUrl } from '../components/ThemeScope';
import {
  addDays, addMonths, endOfWeek, formatLongDate, formatShortDate, monthGrid, monthName, rangeDates, startOfWeek, weekdayHeaders,
} from '../lib/date';
import { evaluateDay } from '../lib/calc/streak';
import type { ISODate } from '../types/models';

type View = 'month' | 'week' | 'day';

const INDICATORS = [
  { key: 'tasks', label: 'All mandatory tasks done', colour: 'var(--status-good)' },
  { key: 'nutrition', label: 'Calories logged', colour: 'var(--series-4)' },
  { key: 'training', label: 'Workout or run', colour: 'var(--series-3)' },
  { key: 'study', label: 'Study logged', colour: 'var(--series-1)' },
  { key: 'missed', label: 'Day not qualified', colour: 'var(--status-critical)' },
];

export default function CalendarPage(): JSX.Element {
  const { selectedDate, setSelectedDate, settings, summaryFor, today } = useApp();
  const [view, setView] = useState<View>('month');
  const gridRef = useRef<HTMLDivElement>(null);

  const grid = useMemo(() => monthGrid(selectedDate, settings.weekStart), [selectedDate, settings.weekStart]);
  const weekDates = rangeDates(startOfWeek(selectedDate, settings.weekStart), endOfWeek(selectedDate, settings.weekStart));
  const headers = weekdayHeaders(settings.weekStart);
  const monthLabel = `${monthName(selectedDate)} ${selectedDate.slice(0, 4)}`;

  function dotsFor(date: ISODate): { key: string; colour: string; label: string }[] {
    const summary = summaryFor(date);
    if (!summary.hasAnyData && date > today) return [];
    const dots: { key: string; colour: string; label: string }[] = [];
    if (summary.tasks.mandatory.eligible > 0 && summary.tasks.mandatory.percent === 100) {
      dots.push({ key: 'tasks', colour: 'var(--status-good)', label: 'All mandatory tasks done' });
    }
    if (summary.nutrition.calories > 0) dots.push({ key: 'nutrition', colour: 'var(--series-4)', label: 'Calories logged' });
    if (summary.gym.length > 0 || summary.runs.length > 0) dots.push({ key: 'training', colour: 'var(--series-3)', label: 'Workout or run' });
    if (summary.studyTotals.minutes > 0) dots.push({ key: 'study', colour: 'var(--series-1)', label: 'Study logged' });
    if (date <= today && evaluateDay(summary, settings, today).outcome === 'missed' && summary.hasAnyData) {
      dots.push({ key: 'missed', colour: 'var(--status-critical)', label: 'Day not qualified' });
    }
    return dots;
  }

  function onGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 };
    const delta = moves[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const next = addDays(selectedDate, delta);
    setSelectedDate(next);
    window.requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus();
    });
  }

  return (
    <div className="page viz">
      <PageHero
        title="Calendar"
        subtitle={`${formatLongDate(selectedDate)} · every date opens a full, editable record.`}
        decor={settings.showDecorations ? decorUrl('mascot-pastel-sky') : undefined}
      />

      <Card
        title={view === 'month' ? monthLabel : view === 'week' ? `Week of ${formatShortDate(weekDates[0])}` : formatShortDate(selectedDate)}
        actions={
          <>
            <SectionTabs
              label="Calendar view"
              value={view}
              options={[
                { value: 'month' as View, label: 'Month' },
                { value: 'week' as View, label: 'Week' },
                { value: 'day' as View, label: 'Day' },
              ]}
              onChange={setView}
            />
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setSelectedDate(view === 'month' ? addMonths(selectedDate, -1) : addDays(selectedDate, view === 'week' ? -7 : -1))}
            >
              ‹ Previous
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setSelectedDate(view === 'month' ? addMonths(selectedDate, 1) : addDays(selectedDate, view === 'week' ? 7 : 1))}
            >
              Next ›
            </button>
          </>
        }
      >
        {view === 'day' ? (
          <p className="small muted">Showing the single day below. Use the date control in the header to move around.</p>
        ) : (
          <>
            <div className="cal-grid" role="row">
              {headers.map((header) => (
                <div key={header.index} className="cal-head" role="columnheader">
                  {header.label}
                </div>
              ))}
            </div>
            <div
              className="cal-grid"
              ref={gridRef}
              role="grid"
              aria-label={view === 'month' ? `Days in ${monthLabel}` : 'Days this week'}
              onKeyDown={onGridKeyDown}
              style={{ marginTop: 4 }}
            >
              {(view === 'month' ? grid : weekDates).map((date) => {
                const dots = dotsFor(date);
                const otherMonth = view === 'month' && date.slice(0, 7) !== selectedDate.slice(0, 7);
                return (
                  <button
                    key={date}
                    type="button"
                    data-date={date}
                    role="gridcell"
                    className={`cal-cell ${otherMonth ? 'other-month' : ''} ${date === today ? 'is-today' : ''}`}
                    aria-selected={date === selectedDate}
                    tabIndex={date === selectedDate ? 0 : -1}
                    aria-label={`${formatLongDate(date)}${dots.length > 0 ? `. ${dots.map((dot) => dot.label).join(', ')}` : '. No records'}`}
                    onClick={() => setSelectedDate(date)}
                  >
                    <span className="cal-num">{Number(date.slice(8, 10))}</span>
                    <span className="cal-dots">
                      {dots.map((dot) => (
                        <span key={dot.key} className="cal-dot" style={{ background: dot.colour }} aria-hidden="true" />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="chart-legend" style={{ marginTop: 10 }}>
              {INDICATORS.map((indicator) => (
                <span key={indicator.key}>
                  <i className="legend-dot" style={{ background: indicator.colour, borderRadius: '50%' }} aria-hidden="true" />
                  {indicator.label}
                </span>
              ))}
            </div>
            <p className="tiny muted" style={{ marginTop: 6 }}>
              Arrow keys move between dates. Each cell announces its own summary for screen readers.
            </p>
          </>
        )}
      </Card>

      <DayDetail date={selectedDate} />
    </div>
  );
}
