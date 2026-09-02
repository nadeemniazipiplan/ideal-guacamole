import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppStore';
import { Badge, Card, EmptyState, Modal, NumberInput, ProgressBar, Segmented, Stat, TextArea, TextInput } from '../components/Ui';
import { PageHero } from '../components/AppShell';
import { BarChart } from '../components/Charts';
import { decorUrl } from '../components/ThemeScope';
import { DEFAULT_MEALS } from '../db/defaults';
import { RECORD_SCHEMA_VERSION } from '../types/models';
import type { DayNutrition, FoodEntry, NutritionMode } from '../types/models';
import { endOfWeek, formatLongDate, formatShortDate, nowInstant, rangeDates, startOfWeek, weekdayName } from '../lib/date';
import { uuid } from '../lib/uuid';
import { checkMacroMismatch, dayNutritionTotals, groupByMeal, nutritionProgress } from '../lib/calc/nutrition';
import { targetsForDate } from '../lib/calc/targets';
import { consumeIntent } from '../lib/bus';
import { LIMITS, round, text as cleanText, multilineText } from '../lib/validate';

interface EntryDraft {
  id: string | null;
  meal: string;
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  time: string;
  notes: string;
}

function emptyEntry(meal: string): EntryDraft {
  return { id: null, meal, name: '', quantity: '', calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, time: '', notes: '' };
}

export default function NutritionPage(): JSX.Element {
  const { data, index, settings, selectedDate, actions, notify } = useApp();
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [error, setError] = useState('');
  const [customMeal, setCustomMeal] = useState('');

  useEffect(() => {
    if (consumeIntent(['food'])) setDraft(emptyEntry(DEFAULT_MEALS[0]));
  }, []);

  const entries = useMemo(
    () => [...(index.food.get(selectedDate) ?? [])].sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99')),
    [index, selectedDate],
  );
  const dayRecord = index.nutrition.get(selectedDate);
  const mode: NutritionMode = dayRecord?.mode ?? 'itemised';
  const targets = targetsForDate(data.targetVersions, selectedDate);
  const totals = dayNutritionTotals(dayRecord, entries);
  const progress = nutritionProgress(totals, targets);
  const mismatch = checkMacroMismatch(totals.calories, totals.protein, totals.carbs, totals.fat);

  const meals = useMemo(() => {
    const set = new Set<string>(DEFAULT_MEALS);
    for (const entry of data.foodEntries) if (entry.meal) set.add(entry.meal);
    return [...set];
  }, [data.foodEntries]);

  const grouped = groupByMeal(entries);

  async function ensureDayRecord(patch: Partial<DayNutrition>): Promise<void> {
    const now = nowInstant();
    const base: DayNutrition = dayRecord ?? {
      id: uuid(),
      createdAt: now,
      updatedAt: now,
      v: RECORD_SCHEMA_VERSION,
      date: selectedDate,
      tz: settings.timeZone,
      mode: 'itemised',
      quickCalories: 0,
      quickProtein: 0,
      quickCarbs: 0,
      quickFat: 0,
      quickFibre: 0,
      waterMl: 0,
      bodyWeightKg: null,
    };
    await actions.putRecord('dayNutrition', { ...base, ...patch });
  }

  async function saveEntry(): Promise<void> {
    if (!draft) return;
    const name = cleanText(draft.name, 80);
    if (!name) {
      setError('Give the food a name.');
      return;
    }
    if (draft.calories < 0 || draft.protein < 0 || draft.carbs < 0 || draft.fat < 0 || draft.fibre < 0) {
      setError('Calories and macros cannot be negative.');
      return;
    }
    setError('');
    const now = nowInstant();
    const existing = draft.id ? data.foodEntries.find((entry) => entry.id === draft.id) : null;
    const record: FoodEntry = {
      id: draft.id ?? uuid(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      v: RECORD_SCHEMA_VERSION,
      date: existing?.date ?? selectedDate,
      tz: settings.timeZone,
      meal: cleanText(draft.meal, 40) || 'Other',
      name,
      quantity: cleanText(draft.quantity, 40),
      calories: round(draft.calories, 1),
      protein: round(draft.protein, 1),
      carbs: round(draft.carbs, 1),
      fat: round(draft.fat, 1),
      fibre: round(draft.fibre, 1),
      time: draft.time || null,
      notes: multilineText(draft.notes, 300),
    };
    await actions.putRecord('foodEntries', record);
    if (mode !== 'itemised') await ensureDayRecord({ mode: 'itemised' });
    notify(draft.id ? 'Food entry updated.' : 'Food entry added.', 'success');
    setDraft(null);
  }

  const weekDates = rangeDates(startOfWeek(selectedDate, settings.weekStart), endOfWeek(selectedDate, settings.weekStart));
  const weekTotals = weekDates.map((date) =>
    dayNutritionTotals(index.nutrition.get(date), index.food.get(date) ?? []),
  );
  const weekCalories = weekTotals.reduce((sum, day) => sum + day.calories, 0);
  const loggedDays = weekTotals.filter((day) => day.calories > 0).length;
  const averageCalories = loggedDays === 0 ? 0 : weekCalories / loggedDays;
  const averageTarget =
    weekDates.reduce((sum, date) => sum + targetsForDate(data.targetVersions, date).calories, 0) / weekDates.length;
  const highest = weekTotals.reduce((best, day, i) => (day.calories > (best?.value ?? -1) ? { value: day.calories, date: weekDates[i] } : best), null as null | { value: number; date: string });
  const lowestCandidates = weekTotals.map((day, i) => ({ value: day.calories, date: weekDates[i] })).filter((d) => d.value > 0);
  const lowest = lowestCandidates.length > 0 ? lowestCandidates.reduce((best, d) => (d.value < best.value ? d : best)) : null;

  return (
    <div className="page">
      <PageHero
        title="Nutrition"
        subtitle={`${formatLongDate(selectedDate)} · ${round(totals.calories, 0)} of ${targets.calories} kcal`}
        decor={settings.showDecorations ? decorUrl('mascot-fruit-spirit') : undefined}
      />

      <Card
        title="How are you logging today?"
        subtitle="Each day uses one mode only, so calories are never counted twice."
        actions={
          <Segmented
            label="Logging mode"
            value={mode}
            options={[
              { value: 'itemised', label: 'Itemised foods' },
              { value: 'quick', label: 'Quick day total' },
            ]}
            onChange={(value) => void ensureDayRecord({ mode: value })}
          />
        }
      >
        <div className="grid grid-4">
          <Stat
            label="Calories"
            value={round(totals.calories, 0)}
            sub={`${progress.calories.remaining >= 0 ? `${round(progress.calories.remaining, 0)} left` : `${round(-progress.calories.remaining, 0)} over`} · ${progress.calories.percent}% of target`}
            tone={progress.calories.percent > 110 ? 'warn' : progress.calories.percent >= 85 ? 'ok' : undefined}
          />
          <Stat label="Protein" value={`${round(totals.protein, 0)} g`} sub={`Target ${targets.protein} g`} />
          <Stat label="Carbohydrate" value={`${round(totals.carbs, 0)} g`} sub={`Target ${targets.carbs} g`} />
          <Stat label="Fat" value={`${round(totals.fat, 0)} g`} sub={`Target ${targets.fat} g`} />
        </div>

        <div className="stack" style={{ marginTop: 14 }}>
          <ProgressBar label="Calories" value={totals.calories} target={targets.calories} unit=" kcal" />
          <ProgressBar label="Protein" value={totals.protein} target={targets.protein} unit=" g" />
          <ProgressBar label="Carbohydrate" value={totals.carbs} target={targets.carbs} unit=" g" />
          <ProgressBar label="Fat" value={totals.fat} target={targets.fat} unit=" g" />
          <ProgressBar label="Fibre" value={totals.fibre} target={targets.fibre} unit=" g" />
        </div>

        {mismatch.mismatch && (
          <div className="note-banner warn" style={{ marginTop: 12 }} role="status">
            Your macros work out to about <strong>{mismatch.derived} kcal</strong> (4 kcal/g protein and carbohydrate, 9
            kcal/g fat) but the entered total is <strong>{mismatch.entered} kcal</strong> - a {mismatch.differencePct}%
            difference. Your entered figure has been kept exactly as you typed it; this is only a heads-up.
          </div>
        )}
        <p className="tiny muted" style={{ marginTop: 10 }}>
          Calorie and macro figures are estimates based on what you enter. This dashboard does not give medical or dietary
          advice.
        </p>
      </Card>

      {mode === 'quick' ? (
        <Card title="Quick day total" subtitle="Enter the whole day in one go. Itemised entries are ignored while this mode is on.">
          <div className="grid grid-3">
            <NumberInput
              label="Calories"
              suffix="kcal"
              value={dayRecord?.quickCalories ?? 0}
              min={0}
              max={LIMITS.calories}
              onChange={(value) => void ensureDayRecord({ mode: 'quick', quickCalories: value ?? 0 })}
            />
            <NumberInput
              label="Protein"
              suffix="g"
              value={dayRecord?.quickProtein ?? 0}
              min={0}
              max={LIMITS.macroGrams}
              onChange={(value) => void ensureDayRecord({ mode: 'quick', quickProtein: value ?? 0 })}
            />
            <NumberInput
              label="Carbohydrate"
              suffix="g"
              value={dayRecord?.quickCarbs ?? 0}
              min={0}
              max={LIMITS.macroGrams}
              onChange={(value) => void ensureDayRecord({ mode: 'quick', quickCarbs: value ?? 0 })}
            />
            <NumberInput
              label="Fat"
              suffix="g"
              value={dayRecord?.quickFat ?? 0}
              min={0}
              max={LIMITS.macroGrams}
              onChange={(value) => void ensureDayRecord({ mode: 'quick', quickFat: value ?? 0 })}
            />
            <NumberInput
              label="Fibre"
              suffix="g"
              value={dayRecord?.quickFibre ?? 0}
              min={0}
              max={LIMITS.macroGrams}
              onChange={(value) => void ensureDayRecord({ mode: 'quick', quickFibre: value ?? 0 })}
            />
          </div>
          {entries.length > 0 && (
            <div className="note-banner" style={{ marginTop: 12 }}>
              You still have {entries.length} itemised entr{entries.length === 1 ? 'y' : 'ies'} saved for this day. They are
              kept but not counted while quick mode is on - switch back to itemised to use them again.
            </div>
          )}
        </Card>
      ) : (
        <Card
          title="Meals"
          actions={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { setDraft(emptyEntry(DEFAULT_MEALS[0])); setError(''); }}>
              + Add food
            </button>
          }
        >
          {entries.length === 0 ? (
            <EmptyState
              title="No food logged for this day"
              action={
                <button type="button" className="btn btn-primary" onClick={() => setDraft(emptyEntry(DEFAULT_MEALS[0]))}>
                  Add the first entry
                </button>
              }
            >
              Add foods one by one with their calories and macros, or switch to <strong>Quick day total</strong> above and
              enter the day in a single step.
            </EmptyState>
          ) : (
            <div className="stack">
              {[...grouped.entries()].map(([meal, mealEntries]) => {
                const mealCalories = mealEntries.reduce((sum, entry) => sum + entry.calories, 0);
                return (
                  <div key={meal}>
                    <div className="row" style={{ marginBottom: 6 }}>
                      <h3 style={{ margin: 0 }}>{meal}</h3>
                      <Badge tone="neutral">{round(mealCalories, 0)} kcal</Badge>
                      <button
                        type="button"
                        className="btn btn-sm right"
                        onClick={() => { setDraft(emptyEntry(meal)); setError(''); }}
                      >
                        + Add to {meal}
                      </button>
                    </div>
                    <ul className="list">
                      {mealEntries.map((entry) => (
                        <li key={entry.id} className="item">
                          <div className="item-main">
                            <div className="item-title">
                              {entry.name}
                              {entry.quantity ? ` · ${entry.quantity}` : ''}
                            </div>
                            <div className="item-meta">
                              <span>{round(entry.calories, 0)} kcal</span>
                              <span>P {round(entry.protein, 1)} g</span>
                              <span>C {round(entry.carbs, 1)} g</span>
                              <span>F {round(entry.fat, 1)} g</span>
                              {entry.fibre > 0 && <span>Fibre {round(entry.fibre, 1)} g</span>}
                              {entry.time && <span>{entry.time}</span>}
                            </div>
                            {entry.notes && <div className="small muted">{entry.notes}</div>}
                          </div>
                          <div className="row-tight">
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() =>
                                setDraft({
                                  id: entry.id,
                                  meal: entry.meal,
                                  name: entry.name,
                                  quantity: entry.quantity,
                                  calories: entry.calories,
                                  protein: entry.protein,
                                  carbs: entry.carbs,
                                  fat: entry.fat,
                                  fibre: entry.fibre,
                                  time: entry.time ?? '',
                                  notes: entry.notes,
                                })
                              }
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              onClick={() => void actions.removeRecord('foodEntries', entry.id, 'Food entry')}
                            >
                              Delete
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {(settings.trackWater || settings.trackBodyWeight) && (
        <Card title="Extras">
          <div className="grid grid-2">
            {settings.trackWater && (
              <NumberInput
                label="Water"
                suffix="ml"
                value={dayRecord?.waterMl ?? 0}
                min={0}
                max={LIMITS.water}
                onChange={(value) => void ensureDayRecord({ waterMl: value ?? 0 })}
              />
            )}
            {settings.trackBodyWeight && (
              <NumberInput
                label="Body weight"
                suffix="kg"
                value={dayRecord?.bodyWeightKg ?? null}
                allowEmpty
                min={0}
                max={LIMITS.weightKg}
                onChange={(value) => void ensureDayRecord({ bodyWeightKg: value })}
              />
            )}
          </div>
        </Card>
      )}

      <Card title="This week" subtitle={`${formatShortDate(weekDates[0])} – ${formatShortDate(weekDates[6])}`}>
        <div className="grid grid-4" style={{ marginBottom: 12 }}>
          <Stat label="Week total" value={`${round(weekCalories, 0)} kcal`} sub={`${loggedDays} day(s) logged`} />
          <Stat label="Daily average" value={`${round(averageCalories, 0)} kcal`} sub={`Target average ${round(averageTarget, 0)} kcal`} />
          <Stat
            label="Target adherence"
            value={averageTarget > 0 ? `${round((averageCalories / averageTarget) * 100, 0)}%` : '—'}
            sub="Average intake vs average target"
          />
          <Stat
            label="Average protein"
            value={`${round(weekTotals.reduce((sum, day) => sum + day.protein, 0) / Math.max(1, loggedDays), 0)} g`}
            sub={`Target ${targets.protein} g`}
          />
        </div>
        <BarChart
          title="Calorie intake by day"
          unit=" kcal"
          target={targets.calories}
          targetLabel="Daily target"
          data={weekDates.map((date, i) => ({
            label: weekdayName(date, true),
            fullLabel: formatShortDate(date),
            value: weekTotals[i].calories,
          }))}
        />
        <p className="small" style={{ marginTop: 8 }}>
          {highest && highest.value > 0 ? (
            <>
              Highest intake: <strong>{round(highest.value, 0)} kcal</strong> on {formatShortDate(highest.date)}.{' '}
              {lowest && (
                <>
                  Lowest logged: <strong>{round(lowest.value, 0)} kcal</strong> on {formatShortDate(lowest.date)}.
                </>
              )}
            </>
          ) : (
            'No calories logged in this week yet.'
          )}
        </p>
      </Card>

      {draft && (
        <Modal
          title={draft.id ? 'Edit food entry' : 'Add food'}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void saveEntry()}>
                Save
              </button>
            </>
          }
        >
          <div className="stack">
            <div className="field">
              <span className="field-label">Meal</span>
              <div className="row">
                {meals.map((meal) => (
                  <button key={meal} type="button" className="chip" aria-pressed={draft.meal === meal} onClick={() => setDraft({ ...draft, meal })}>
                    {meal}
                  </button>
                ))}
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <input
                  type="text"
                  value={customMeal}
                  placeholder="New meal group"
                  aria-label="New meal group"
                  maxLength={40}
                  onChange={(event) => setCustomMeal(event.target.value)}
                  style={{ maxWidth: 220 }}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    const value = cleanText(customMeal, 40);
                    if (value) {
                      setDraft({ ...draft, meal: value });
                      setCustomMeal('');
                    }
                  }}
                >
                  Use
                </button>
              </div>
            </div>
            <TextInput label="Food" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} error={error} required />
            <div className="grid grid-2">
              <TextInput label="Quantity / serving" value={draft.quantity} onChange={(value) => setDraft({ ...draft, quantity: value })} placeholder="e.g. 150 g, 1 cup" />
              <TextInput label="Time" type="time" value={draft.time} onChange={(value) => setDraft({ ...draft, time: value })} />
            </div>
            <div className="grid grid-3">
              <NumberInput label="Calories" suffix="kcal" value={draft.calories} min={0} max={LIMITS.calories} onChange={(value) => setDraft({ ...draft, calories: value ?? 0 })} />
              <NumberInput label="Protein" suffix="g" value={draft.protein} min={0} max={LIMITS.macroGrams} onChange={(value) => setDraft({ ...draft, protein: value ?? 0 })} />
              <NumberInput label="Carbohydrate" suffix="g" value={draft.carbs} min={0} max={LIMITS.macroGrams} onChange={(value) => setDraft({ ...draft, carbs: value ?? 0 })} />
              <NumberInput label="Fat" suffix="g" value={draft.fat} min={0} max={LIMITS.macroGrams} onChange={(value) => setDraft({ ...draft, fat: value ?? 0 })} />
              <NumberInput label="Fibre" suffix="g" value={draft.fibre} min={0} max={LIMITS.macroGrams} onChange={(value) => setDraft({ ...draft, fibre: value ?? 0 })} />
            </div>
            <div className="note-banner">
              Macro estimate for this entry: <strong>{checkMacroMismatch(draft.calories || 1, draft.protein, draft.carbs, draft.fat).derived} kcal</strong>. Nothing is filled
              in for you - enter the values from your own source.
            </div>
            <TextArea label="Notes" value={draft.notes} onChange={(value) => setDraft({ ...draft, notes: value })} rows={2} />
          </div>
        </Modal>
      )}
    </div>
  );
}
