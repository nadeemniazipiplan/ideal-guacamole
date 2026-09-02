import { useMemo, useState } from 'react';
import { useApp } from '../state/AppStore';
import { Card, Select, Stat, TextInput } from '../components/Ui';
import { PageHero } from '../components/AppShell';
import { BarChart, LineChart, RankedBarChart, StatusStackChart } from '../components/Charts';
import { decorUrl } from '../components/ThemeScope';
import { analyseRange, buildWeeklyReview } from '../lib/analytics';
import { addDays, diffDays, endOfMonth, formatShortDate, rangeDates, startOfMonth } from '../lib/date';
import { buildCsv, downloadText } from '../lib/csv';
import type { CsvModule } from '../lib/csv';
import { round } from '../lib/validate';
import { kmToMi } from '../lib/calc/fitness';

type RangeKey = '7' | '30' | '90' | 'month' | 'year' | 'custom';

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
];

export default function AnalyticsPage(): JSX.Element {
  const { data, settings, selectedDate, today, summaryFor } = useApp();
  const [rangeKey, setRangeKey] = useState<RangeKey>('7');
  const [customFrom, setCustomFrom] = useState(addDays(today, -13));
  const [customTo, setCustomTo] = useState(today);
  const [csvModule, setCsvModule] = useState<CsvModule>('daily');

  const { from, to } = useMemo(() => {
    switch (rangeKey) {
      case '7':
        return { from: addDays(selectedDate, -6), to: selectedDate };
      case '30':
        return { from: addDays(selectedDate, -29), to: selectedDate };
      case '90':
        return { from: addDays(selectedDate, -89), to: selectedDate };
      case 'month':
        return { from: startOfMonth(selectedDate), to: endOfMonth(selectedDate) };
      case 'year':
        return { from: `${selectedDate.slice(0, 4)}-01-01`, to: `${selectedDate.slice(0, 4)}-12-31` };
      case 'custom':
      default:
        return { from: customFrom <= customTo ? customFrom : customTo, to: customTo >= customFrom ? customTo : customFrom };
    }
  }, [rangeKey, selectedDate, customFrom, customTo]);

  const dates = useMemo(() => rangeDates(from, to), [from, to]);
  const previousDates = useMemo(() => {
    const span = dates.length;
    if (span === 0) return [];
    return rangeDates(addDays(from, -span), addDays(from, -1));
  }, [dates.length, from]);

  const chaptersIn = (list: string[]) =>
    data.chapters.filter((chapter) => chapter.completed && chapter.completedDate && list.includes(chapter.completedDate)).length;

  const analysis = useMemo(
    () => analyseRange(dates, summaryFor, settings, today, chaptersIn(dates), data.subjects),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dates, summaryFor, settings, today, data.chapters, data.subjects],
  );
  const previous = useMemo(
    () => (previousDates.length > 0 ? analyseRange(previousDates, summaryFor, settings, today, chaptersIn(previousDates), data.subjects) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previousDates, summaryFor, settings, today, data.chapters, data.subjects],
  );
  const review = useMemo(() => buildWeeklyReview(analysis, previous), [analysis, previous]);

  const compact = dates.length > 31;
  const labelFor = (date: string) => (compact ? date.slice(8, 10) : formatShortDate(date));

  function exportCsv(): void {
    const dailyRows = analysis.summaries.map((summary, i) => [
      summary.date,
      summary.tasks.all.completed,
      summary.tasks.all.eligible,
      summary.tasks.all.percent,
      summary.tasks.mandatory.percent,
      round(summary.nutrition.calories, 0),
      summary.targets.calories,
      round(summary.nutrition.protein, 1),
      round(summary.nutrition.carbs, 1),
      round(summary.nutrition.fat, 1),
      round(summary.nutrition.fibre, 1),
      summary.active.total,
      summary.energy.methodLabel,
      summary.energy.totalExpenditure,
      summary.energy.balance,
      summary.stepCount,
      summary.targets.steps,
      round(summary.trainingVolumeKg, 0),
      round(summary.runDistanceKm, 2),
      summary.studyTotals.minutes,
      summary.targets.studyMinutes,
      analysis.evaluations[i]?.outcome ?? '',
      summary.note?.mood ?? '',
      summary.note?.energy ?? '',
    ]);
    const file = buildCsv(csvModule, data, from, to, dailyRows);
    downloadText(file.filename, file.content);
  }

  return (
    <div className="page viz">
      <PageHero
        title="Analytics"
        subtitle={`${formatShortDate(from)} – ${formatShortDate(to)} · ${dates.length} days`}
        decor={settings.showDecorations ? decorUrl('mascot-spark') : undefined}
      />

      <Card title="Range" className="no-print">
        <div className="grid grid-2">
          <Select label="Date range" value={rangeKey} options={RANGE_OPTIONS} onChange={setRangeKey} />
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Select
              label="CSV module"
              value={csvModule}
              options={[
                { value: 'daily' as CsvModule, label: 'Daily summary' },
                { value: 'tasks' as CsvModule, label: 'Tasks' },
                { value: 'nutrition' as CsvModule, label: 'Nutrition' },
                { value: 'gym' as CsvModule, label: 'Gym' },
                { value: 'running' as CsvModule, label: 'Running' },
                { value: 'steps' as CsvModule, label: 'Steps' },
                { value: 'study' as CsvModule, label: 'Study' },
              ]}
              onChange={setCsvModule}
            />
            <button type="button" className="btn" onClick={exportCsv}>
              Export CSV
            </button>
            <button type="button" className="btn" onClick={() => window.print()}>
              Print report
            </button>
          </div>
        </div>
        {rangeKey === 'custom' && (
          <div className="grid grid-2" style={{ marginTop: 10 }}>
            <TextInput label="From" type="date" value={customFrom} onChange={setCustomFrom} />
            <TextInput label="To" type="date" value={customTo} onChange={setCustomTo} />
          </div>
        )}
      </Card>

      <div className="grid grid-4">
        <Stat label="Current streak" value={`${analysis.streaks.current} day(s)`} sub={`Longest ${analysis.streaks.longest}`} tone="ok" />
        <Stat label="Successful days" value={analysis.streaks.successfulDays} sub={`${analysis.streaks.weeklySuccessRatePct}% success rate`} />
        <Stat label="Rest / excused" value={`${analysis.streaks.restDays} / ${analysis.streaks.excusedDays}`} sub="Do not break the streak" />
        <Stat label="Days not qualified" value={analysis.streaks.missedDays} tone={analysis.streaks.missedDays > 0 ? 'bad' : undefined} sub={analysis.streaks.brokenDates.slice(0, 3).map(formatShortDate).join(', ') || 'None'} />
      </div>

      <Card title="Tasks">
        <div className="grid grid-4" style={{ marginBottom: 12 }}>
          <Stat label="Scheduled" value={analysis.taskScheduled} />
          <Stat label="Completed" value={analysis.taskCompleted} tone="ok" />
          <Stat label="Missed" value={analysis.taskMissed} tone={analysis.taskMissed > 0 ? 'bad' : undefined} />
          <Stat label="Completion" value={`${analysis.taskPercent}%`} sub={`Mandatory ${analysis.mandatoryPercent}%`} />
        </div>
        <StatusStackChart
          title="Task outcomes by day"
          data={analysis.summaries.map((summary) => ({
            label: labelFor(summary.date),
            fullLabel: formatShortDate(summary.date),
            completed: summary.tasks.all.completed,
            missed: summary.tasks.all.missed,
            excused: summary.tasks.all.excused,
          }))}
        />
        <div style={{ marginTop: 12 }}>
          <RankedBarChart
            title="Completion rate by category"
            unit="%"
            decimals={1}
            data={analysis.missedByCategory.map((category) => ({
              label: category.category,
              fullLabel: `${category.category} (${category.completed}/${category.scheduled})`,
              value: category.percent,
            }))}
          />
        </div>
      </Card>

      <Card title="Nutrition and energy balance">
        <div className="grid grid-4" style={{ marginBottom: 12 }}>
          <Stat label="Average intake" value={`${analysis.calorieAverage} kcal`} sub={`Target average ${analysis.calorieTargetAverage} kcal`} />
          <Stat label="Adherence" value={`${analysis.adherencePct}%`} sub={`${analysis.daysWithFood} of ${analysis.elapsedDays} days so far logged`} />
          <Stat label="Average expenditure" value={`${analysis.expenditureAverage} kcal`} sub={settings.expenditureMethod === 'full_tdee' ? 'Method B - full TDEE' : 'Method A - baseline + exercise'} />
          <Stat
            label={analysis.balanceAverage >= 0 ? 'Average estimated deficit' : 'Average estimated surplus'}
            value={`${Math.abs(analysis.balanceAverage)} kcal`}
            tone={analysis.balanceAverage >= 0 ? 'ok' : 'warn'}
            sub={settings.expenditureMethod === 'full_tdee' ? 'Method B - full TDEE' : 'Method A - baseline + exercise'}
          />
        </div>
        <BarChart
          title="Calorie intake by day"
          unit=" kcal"
          target={analysis.calorieTargetAverage}
          targetLabel="Average target"
          data={analysis.summaries.map((summary) => ({
            label: labelFor(summary.date),
            fullLabel: formatShortDate(summary.date),
            value: round(summary.nutrition.calories, 0),
          }))}
        />
        <div style={{ marginTop: 12 }}>
          <LineChart
            title="Estimated expenditure and balance"
            unit=" kcal"
            series={[
              {
                name: 'Estimated expenditure',
                slot: 1,
                points: analysis.summaries.map((summary) => ({ label: labelFor(summary.date), fullLabel: formatShortDate(summary.date), value: summary.energy.totalExpenditure })),
              },
              {
                name: 'Estimated balance (+ deficit / - surplus)',
                slot: 2,
                points: analysis.summaries.map((summary) => ({ label: labelFor(summary.date), fullLabel: formatShortDate(summary.date), value: summary.energy.balance })),
              },
            ]}
          />
        </div>
        <div className="grid grid-4" style={{ marginTop: 12 }}>
          <Stat label="Average protein" value={`${analysis.proteinAverage} g`} />
          <Stat label="Average carbohydrate" value={`${analysis.carbsAverage} g`} />
          <Stat label="Average fat" value={`${analysis.fatAverage} g`} />
          <Stat label="Average fibre" value={`${analysis.fibreAverage} g`} />
        </div>
      </Card>

      <Card title="Training, running and steps">
        <div className="grid grid-4" style={{ marginBottom: 12 }}>
          <Stat label="Gym sessions" value={analysis.gymSessions} sub={`${analysis.trainingVolumeKg} kg total volume`} />
          <Stat
            label="Distance"
            value={settings.distanceUnit === 'km' ? `${analysis.runDistanceKm} km` : `${round(kmToMi(analysis.runDistanceKm), 2)} mi`}
            sub={`${analysis.runDurationMinutes} minutes`}
          />
          <Stat
            label="Average pace"
            value={analysis.averagePaceMinPerKm === null ? '—' : `${Math.floor(analysis.averagePaceMinPerKm)}:${String(Math.round((analysis.averagePaceMinPerKm % 1) * 60)).padStart(2, '0')} /km`}
            sub="Total duration ÷ total distance"
          />
          <Stat label="Steps per day" value={analysis.stepsAverage.toLocaleString()} sub={`${analysis.stepsTotal.toLocaleString()} total`} />
        </div>
        <BarChart
          title="Steps by day"
          data={analysis.summaries.map((summary) => ({ label: labelFor(summary.date), fullLabel: formatShortDate(summary.date), value: summary.stepCount }))}
        />
        <div style={{ marginTop: 12 }}>
          <BarChart
            title="Active calories by day"
            unit=" kcal"
            data={analysis.summaries.map((summary) => ({ label: labelFor(summary.date), fullLabel: formatShortDate(summary.date), value: summary.active.total }))}
          />
        </div>
      </Card>

      <Card title="Study">
        <div className="grid grid-4" style={{ marginBottom: 12 }}>
          <Stat label="Total minutes" value={analysis.studyMinutes} sub={`Target ${analysis.studyTargetMinutes} min`} />
          <Stat label="Daily average" value={`${analysis.studyAverage} min`} />
          <Stat
            label="Target completion"
            value={analysis.studyTargetMinutes === 0 ? '—' : `${round((analysis.studyMinutes / analysis.studyTargetMinutes) * 100, 0)}%`}
          />
          <Stat label="Chapters completed" value={analysis.chaptersCompleted} />
        </div>
        <BarChart
          title="Study minutes by day"
          unit=" min"
          data={analysis.summaries.map((summary) => ({ label: labelFor(summary.date), fullLabel: formatShortDate(summary.date), value: summary.studyTotals.minutes }))}
        />
        <div style={{ marginTop: 12 }}>
          <RankedBarChart title="Minutes by subject" unit=" min" data={analysis.studyDistribution.map((item) => ({ label: item.name, value: item.minutes }))} />
        </div>
      </Card>

      <Card title="Written review" subtitle={`Generated from your records for ${formatShortDate(from)} – ${formatShortDate(to)}. No external service is used.`}>
        {!review.hasEnoughData ? (
          <p className="small muted">{review.observations[0]}</p>
        ) : (
          <div className="grid grid-2">
            <div>
              <h3>What was achieved</h3>
              <ul className="review-list small">
                {review.achieved.length === 0 ? <li>Nothing was completed in this range.</li> : review.achieved.map((line) => <li key={line}>{line}</li>)}
              </ul>
              <h3 style={{ marginTop: 12 }}>What was missed</h3>
              <ul className="review-list small">
                {review.missed.length === 0 ? <li>Nothing was missed in this range.</li> : review.missed.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </div>
            <div>
              <h3>Change from the previous {dates.length} days</h3>
              <ul className="review-list small">
                {review.changes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <h3 style={{ marginTop: 12 }}>Best and hardest day</h3>
              <ul className="review-list small">
                <li>{review.bestDay}</li>
                <li>{review.hardestDay}</li>
              </ul>
              <h3 style={{ marginTop: 12 }}>Observations</h3>
              <ul className="review-list small">
                {review.observations.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <p className="tiny muted" style={{ marginTop: 10 }}>
          These statements describe what your records show. They do not claim that one thing caused another, and they are
          not medical advice.
        </p>
      </Card>

      <Card title="Days that did not qualify">
        {analysis.streaks.brokenDates.length === 0 ? (
          <p className="small muted">Every recorded day in this range met your success conditions.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <caption>Why each day did not qualify</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {analysis.evaluations
                  .filter((evaluation) => evaluation.outcome === 'missed')
                  .map((evaluation) => (
                    <tr key={evaluation.date}>
                      <th scope="row">{formatShortDate(evaluation.date)}</th>
                      <td style={{ whiteSpace: 'normal' }}>{evaluation.reason}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="tiny muted" style={{ marginTop: 8 }}>
          Range covers {diffDays(from, to) + 1} calendar day(s), of which {analysis.elapsedDays} have happened. Averages and
          completion rates use only those elapsed days.
        </p>
      </Card>
    </div>
  );
}
