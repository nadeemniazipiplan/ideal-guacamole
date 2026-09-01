import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppStore';
import {
  Card, ConfirmDialog, Modal, NumberInput, SectionTabs, Segmented, Select, Stat, TabPanel, TextInput, Toggle,
} from '../components/Ui';
import { PageHero } from '../components/AppShell';
import { PAGE_THEME_PRESETS, DEFAULT_TARGETS, MET_PRESETS } from '../db/defaults';
import { buildDemoData, DEMO_PREFIX, isDemoRecord } from '../db/seed';
import { RECORD_SCHEMA_VERSION } from '../types/models';
import type { DistanceUnit, ExpenditureMethod, PageKey, TargetSet, TargetVersion, ThemeMode, WeekStart, WeightUnit } from '../types/models';
import { COMMON_TIME_ZONES, addDays, formatShortDate, isValidISODate, isValidTimeZone, nowInstant, todayISO } from '../lib/date';
import { uuid } from '../lib/uuid';
import { sortedVersions, targetsForDate } from '../lib/calc/targets';
import { METHOD_EXPLANATIONS, METHOD_LABELS } from '../lib/calc/energy';
import { BACKUP_SCHEMA_VERSION, MAX_IMPORT_BYTES, buildBackup, decryptBackup, encryptBackup, isEncryptedBackup, previewImport } from '../lib/backup';
import type { ImportPreview } from '../lib/backup';
import { downloadText } from '../lib/csv';
import { hashPin, isValidPin } from '../lib/pin';
import { notificationSupport, requestNotificationPermission } from '../lib/notify';
import { LIMITS, hexColour } from '../lib/validate';

type Section = 'profile' | 'targets' | 'streaks' | 'reminders' | 'appearance' | 'data' | 'privacy';

const SECTIONS: { value: Section; label: string }[] = [
  { value: 'profile', label: 'Profile' },
  { value: 'targets', label: 'Targets' },
  { value: 'streaks', label: 'Streaks' },
  { value: 'reminders', label: 'Reminders' },
  { value: 'appearance', label: 'Appearance' },
  { value: 'data', label: 'Backup' },
  { value: 'privacy', label: 'Privacy' },
];

const TARGET_FIELDS: { key: keyof TargetSet; label: string; suffix: string; max: number }[] = [
  { key: 'calories', label: 'Daily calories', suffix: 'kcal', max: LIMITS.calories },
  { key: 'protein', label: 'Protein', suffix: 'g', max: LIMITS.macroGrams },
  { key: 'carbs', label: 'Carbohydrate', suffix: 'g', max: LIMITS.macroGrams },
  { key: 'fat', label: 'Fat', suffix: 'g', max: LIMITS.macroGrams },
  { key: 'fibre', label: 'Fibre', suffix: 'g', max: LIMITS.macroGrams },
  { key: 'water', label: 'Water', suffix: 'ml', max: LIMITS.water },
  { key: 'steps', label: 'Steps', suffix: 'steps', max: LIMITS.steps },
  { key: 'studyMinutes', label: 'Study', suffix: 'min', max: LIMITS.minutes },
  { key: 'baselineExpenditure', label: 'Baseline expenditure (Method A)', suffix: 'kcal', max: LIMITS.calories },
  { key: 'tdee', label: 'Full TDEE (Method B)', suffix: 'kcal', max: LIMITS.calories },
  { key: 'weeklyWorkouts', label: 'Workouts per week', suffix: 'sessions', max: 21 },
  { key: 'weeklyRunKm', label: 'Running per week', suffix: 'km', max: 500 },
];

export default function SettingsPage(): JSX.Element {
  const { data, settings, actions, notify, today, reload } = useApp();
  const [section, setSection] = useState<Section>('profile');
  const [versionDraft, setVersionDraft] = useState<TargetVersion | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: React.ReactNode; requireTyping?: string; run: () => void } | null>(null);
  const [importState, setImportState] = useState<{ preview: ImportPreview; mode: 'merge' | 'replace' } | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [pinValue, setPinValue] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const versions = useMemo(() => sortedVersions(data.targetVersions), [data.targetVersions]);
  const currentTargets = targetsForDate(data.targetVersions, today);
  const demoCount = useMemo(
    () =>
      [
        ...data.taskInstances, ...data.taskTemplates, ...data.foodEntries, ...data.dayNutrition, ...data.gymSessions,
        ...data.runSessions, ...data.stepEntries, ...data.subjects, ...data.chapters, ...data.studySessions,
      ].filter(isDemoRecord).length,
    [data],
  );

  async function saveVersion(version: TargetVersion): Promise<void> {
    if (!isValidISODate(version.effectiveFrom)) {
      notify('Choose a valid effective date.', 'error');
      return;
    }
    await actions.putRecord('targetVersions', version);
    notify(
      version.effectiveFrom > today
        ? `Saved. These targets take effect on ${formatShortDate(version.effectiveFrom)}; results before then are unchanged.`
        : 'Targets saved.',
      'success',
    );
    setVersionDraft(null);
  }

  function exportJson(): void {
    const backup = buildBackup(data);
    downloadText(`life-dashboard-backup-${today}.json`, JSON.stringify(backup, null, 2), 'application/json');
    void actions.updateSettings({ lastExportAt: nowInstant() });
    notify('Backup downloaded.', 'success');
  }

  async function exportEncrypted(): Promise<void> {
    if (passphrase.length < 8) {
      notify('Use a passphrase of at least 8 characters.', 'error');
      return;
    }
    try {
      const encrypted = await encryptBackup(buildBackup(data), passphrase);
      downloadText(`life-dashboard-backup-${today}.encrypted.json`, JSON.stringify(encrypted, null, 2), 'application/json');
      await actions.updateSettings({ lastExportAt: nowInstant() });
      setPassphrase('');
      notify('Encrypted backup downloaded. Without that passphrase the file cannot be recovered.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Encryption failed.', 'error');
    }
  }

  async function handleFile(file: File): Promise<void> {
    if (file.size > MAX_IMPORT_BYTES) {
      notify(`That file is larger than the ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB import limit.`, 'error');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      notify('That file is not valid JSON.', 'error');
      return;
    }
    if (isEncryptedBackup(parsed)) {
      if (!passphrase) {
        notify('This backup is encrypted. Enter its passphrase above, then choose the file again.', 'warning');
        return;
      }
      try {
        parsed = await decryptBackup(parsed, passphrase);
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Could not decrypt that backup.', 'error');
        return;
      }
    }
    const preview = previewImport(parsed, data);
    if (!preview.ok) {
      notify(preview.error ?? 'That backup could not be read.', 'error');
      return;
    }
    setImportState({ preview, mode: 'merge' });
  }

  return (
    <div className="page">
      <PageHero title="Settings" subtitle="Everything here is stored on this device only." />

      <SectionTabs label="Settings sections" value={section} options={SECTIONS} onChange={setSection} />

      {/* ------------------------------------------------------------ profile */}
      {section === 'profile' && (
        <TabPanel id="profile">
          <Card title="Profile and region">
            <div className="grid grid-2">
              <TextInput label="Display name" value={settings.displayName} onChange={(value) => void actions.updateSettings({ displayName: value })} hint="Used only for the greeting on Today." />
              <Select
                label="Time zone"
                value={settings.timeZone}
                options={[...new Set([settings.timeZone, ...COMMON_TIME_ZONES])].filter(isValidTimeZone).map((tz) => ({ value: tz, label: tz }))}
                onChange={(value) => void actions.updateSettings({ timeZone: value })}
                hint="All dates, day boundaries and streaks use this zone, not UTC."
              />
              <Select
                label="Week starts on"
                value={settings.weekStart}
                options={[
                  { value: 'monday' as WeekStart, label: 'Monday' },
                  { value: 'sunday' as WeekStart, label: 'Sunday' },
                ]}
                onChange={(value) => void actions.updateSettings({ weekStart: value })}
              />
              <NumberInput
                label="Body weight (used for MET estimates)"
                suffix="kg"
                value={settings.bodyWeightKg}
                min={20}
                max={LIMITS.weightKg}
                step={0.1}
                onChange={(value) => void actions.updateSettings({ bodyWeightKg: value ?? 70 })}
              />
              <Select
                label="Weight unit"
                value={settings.weightUnit}
                options={[
                  { value: 'kg' as WeightUnit, label: 'Kilograms (kg)' },
                  { value: 'lb' as WeightUnit, label: 'Pounds (lb)' },
                ]}
                onChange={(value) => void actions.updateSettings({ weightUnit: value })}
              />
              <Select
                label="Distance unit"
                value={settings.distanceUnit}
                options={[
                  { value: 'km' as DistanceUnit, label: 'Kilometres (km)' },
                  { value: 'mi' as DistanceUnit, label: 'Miles (mi)' },
                ]}
                onChange={(value) => void actions.updateSettings({ distanceUnit: value, paceUnit: value === 'km' ? 'min/km' : 'min/mi' })}
              />
              <Select
                label="Pace unit"
                value={settings.paceUnit}
                options={[
                  { value: 'min/km', label: 'Minutes per kilometre' },
                  { value: 'min/mi', label: 'Minutes per mile' },
                ]}
                onChange={(value) => void actions.updateSettings({ paceUnit: value })}
              />
            </div>
            <Toggle label="Track water" checked={settings.trackWater} onChange={(checked) => void actions.updateSettings({ trackWater: checked })} />
            <Toggle label="Track body weight per day" checked={settings.trackBodyWeight} onChange={(checked) => void actions.updateSettings({ trackBodyWeight: checked })} />
          </Card>

          <Card title="Expenditure method" subtitle="This decides how the estimated deficit or surplus is worked out.">
            <Segmented
              label="Expenditure method"
              value={settings.expenditureMethod}
              options={[
                { value: 'baseline_plus_exercise' as ExpenditureMethod, label: 'Method A' },
                { value: 'full_tdee' as ExpenditureMethod, label: 'Method B' },
              ]}
              onChange={(value) => void actions.updateSettings({ expenditureMethod: value })}
            />
            <div className="note-banner" style={{ marginTop: 10 }}>
              <strong>{METHOD_LABELS[settings.expenditureMethod]}</strong>
              <p className="small" style={{ marginTop: 6 }}>{METHOD_EXPLANATIONS[settings.expenditureMethod]}</p>
              <p className="small" style={{ marginTop: 6 }}>
                Estimated energy balance = estimated total expenditure − calorie intake. A positive figure is shown as an
                estimated deficit, a negative one as an estimated surplus. Exercise calories are never used on their own,
                and the method is printed beside every figure. These are estimates, not clinical measurements.
              </p>
            </div>
            <div className="grid grid-2" style={{ marginTop: 10 }}>
              <Stat label="Baseline (Method A)" value={`${currentTargets.baselineExpenditure} kcal`} sub="Excludes logged exercise" />
              <Stat label="Full TDEE (Method B)" value={`${currentTargets.tdee} kcal`} sub="Already includes usual activity" />
            </div>
            <p className="tiny muted" style={{ marginTop: 8 }}>
              Change these two figures under <strong>Targets</strong>, where they are versioned by effective date.
            </p>
          </Card>

          <Card title="MET reference" subtitle="Used for the exercise calorie estimate: MET × 3.5 × body weight ÷ 200 × minutes.">
            <div className="table-wrap">
              <table>
                <caption>Reference MET values (editable on every entry)</caption>
                <thead>
                  <tr>
                    <th scope="col">Activity</th>
                    <th scope="col">MET</th>
                    <th scope="col">Estimate for 60 min at {settings.bodyWeightKg} kg</th>
                  </tr>
                </thead>
                <tbody>
                  {MET_PRESETS.map((preset) => (
                    <tr key={preset.label}>
                      <th scope="row">{preset.label}</th>
                      <td>{preset.met}</td>
                      <td>{Math.round(((preset.met * 3.5 * settings.bodyWeightKg) / 200) * 60)} kcal</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabPanel>
      )}

      {/* ------------------------------------------------------------ targets */}
      {section === 'targets' && (
        <TabPanel id="targets">
          <Card
            title="Targets in force today"
            subtitle="Targets are versioned. Editing a future version never rewrites a past result."
            actions={
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() =>
                  setVersionDraft({
                    id: uuid(),
                    createdAt: nowInstant(),
                    updatedAt: nowInstant(),
                    v: RECORD_SCHEMA_VERSION,
                    effectiveFrom: addDays(today, 1),
                    tz: settings.timeZone,
                    targets: { ...currentTargets },
                    note: '',
                  })
                }
              >
                + New target version
              </button>
            }
          >
            <div className="grid grid-4">
              {TARGET_FIELDS.slice(0, 8).map((field) => (
                <Stat key={field.key} label={field.label} value={`${currentTargets[field.key]} ${field.suffix}`} />
              ))}
            </div>
          </Card>

          <Card title="Target history">
            <div className="table-wrap">
              <table>
                <caption>Every target version, newest first</caption>
                <thead>
                  <tr>
                    <th scope="col">Effective from</th>
                    <th scope="col">Calories</th>
                    <th scope="col">Protein</th>
                    <th scope="col">Steps</th>
                    <th scope="col">Study</th>
                    <th scope="col">Baseline / TDEE</th>
                    <th scope="col">Note</th>
                    <th scope="col"><span className="visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((version) => (
                    <tr key={version.id}>
                      <th scope="row">
                        {formatShortDate(version.effectiveFrom)}
                        {version.effectiveFrom > today && <span className="badge warn" style={{ marginLeft: 6 }}>Future</span>}
                      </th>
                      <td>{version.targets.calories}</td>
                      <td>{version.targets.protein} g</td>
                      <td>{version.targets.steps.toLocaleString()}</td>
                      <td>{version.targets.studyMinutes} min</td>
                      <td>
                        {version.targets.baselineExpenditure} / {version.targets.tdee}
                      </td>
                      <td style={{ whiteSpace: 'normal' }}>{version.note}</td>
                      <td>
                        <div className="row-tight">
                          <button type="button" className="btn btn-sm" onClick={() => setVersionDraft(version)}>
                            Edit
                          </button>
                          {versions.length > 1 && (
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              onClick={() => void actions.removeRecord('targetVersions', version.id, 'Target version')}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabPanel>
      )}

      {/* ------------------------------------------------------------ streaks */}
      {section === 'streaks' && (
        <TabPanel id="streaks">
          <Card title="What makes a day successful" subtitle="Switch on only the conditions you want to be judged against.">
            <Toggle
              label="All mandatory tasks completed"
              checked={settings.streakRules.requireMandatoryTasks}
              onChange={(checked) => void actions.updateSettings({ streakRules: { ...settings.streakRules, requireMandatoryTasks: checked } })}
            />
            <Toggle
              label="Calories inside a range around the target"
              checked={settings.streakRules.requireCalorieRange}
              onChange={(checked) => void actions.updateSettings({ streakRules: { ...settings.streakRules, requireCalorieRange: checked } })}
            />
            {settings.streakRules.requireCalorieRange && (
              <div className="grid grid-2">
                <NumberInput
                  label="Lower bound"
                  suffix="% of target"
                  value={settings.streakRules.calorieRangeLowPct}
                  min={30}
                  max={150}
                  onChange={(value) => void actions.updateSettings({ streakRules: { ...settings.streakRules, calorieRangeLowPct: value ?? 85 } })}
                />
                <NumberInput
                  label="Upper bound"
                  suffix="% of target"
                  value={settings.streakRules.calorieRangeHighPct}
                  min={50}
                  max={200}
                  onChange={(value) => void actions.updateSettings({ streakRules: { ...settings.streakRules, calorieRangeHighPct: value ?? 110 } })}
                />
              </div>
            )}
            <Toggle
              label="Protein minimum reached"
              checked={settings.streakRules.requireProteinMinimum}
              onChange={(checked) => void actions.updateSettings({ streakRules: { ...settings.streakRules, requireProteinMinimum: checked } })}
            />
            {settings.streakRules.requireProteinMinimum && (
              <NumberInput
                label="Protein minimum"
                suffix="% of target"
                value={settings.streakRules.proteinMinimumPct}
                min={10}
                max={150}
                onChange={(value) => void actions.updateSettings({ streakRules: { ...settings.streakRules, proteinMinimumPct: value ?? 80 } })}
              />
            )}
            <Toggle label="Step target reached" checked={settings.streakRules.requireSteps} onChange={(checked) => void actions.updateSettings({ streakRules: { ...settings.streakRules, requireSteps: checked } })} />
            <Toggle label="Planned workout or run completed" checked={settings.streakRules.requireWorkout} onChange={(checked) => void actions.updateSettings({ streakRules: { ...settings.streakRules, requireWorkout: checked } })} />
            <Toggle label="Study minutes target reached" checked={settings.streakRules.requireStudyMinutes} onChange={(checked) => void actions.updateSettings({ streakRules: { ...settings.streakRules, requireStudyMinutes: checked } })} />
          </Card>

          <Card title="Rest and excused days">
            <div className="field">
              <span className="field-label">Planned rest days</span>
              <div className="row">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, dayIndex) => (
                  <button
                    key={day}
                    type="button"
                    className="chip"
                    aria-pressed={settings.streakRules.restDays.includes(dayIndex)}
                    onClick={() =>
                      void actions.updateSettings({
                        streakRules: {
                          ...settings.streakRules,
                          restDays: settings.streakRules.restDays.includes(dayIndex)
                            ? settings.streakRules.restDays.filter((d) => d !== dayIndex)
                            : [...settings.streakRules.restDays, dayIndex],
                        },
                      })
                    }
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
            <Toggle
              label="Rest days count as successful days"
              checked={settings.streakRules.restDaysCountAsSuccess}
              onChange={(checked) => void actions.updateSettings({ streakRules: { ...settings.streakRules, restDaysCountAsSuccess: checked } })}
              hint="When switched off, a rest day is skipped instead: it neither adds to nor breaks the streak."
            />
            <p className="small muted">
              Any single day can also be marked as a rest day or an excused day from the Calendar page, which is useful for
              illness or travel.
            </p>
          </Card>
        </TabPanel>
      )}

      {/* ---------------------------------------------------------- reminders */}
      {section === 'reminders' && (
        <TabPanel id="reminders">
          <Card title="Reminders">
            <Toggle label="Reminders on" checked={settings.reminders.enabled} onChange={(checked) => void actions.updateSettings({ reminders: { ...settings.reminders, enabled: checked } })} />
            <div className="grid grid-3">
              <TextInput label="Quiet hours start" type="time" value={settings.reminders.quietHoursStart} onChange={(value) => void actions.updateSettings({ reminders: { ...settings.reminders, quietHoursStart: value } })} />
              <TextInput label="Quiet hours end" type="time" value={settings.reminders.quietHoursEnd} onChange={(value) => void actions.updateSettings({ reminders: { ...settings.reminders, quietHoursEnd: value } })} />
              <NumberInput
                label="Minimum gap between reminders"
                suffix="min"
                value={settings.reminders.frequencyMinutes}
                min={15}
                max={720}
                onChange={(value) => void actions.updateSettings({ reminders: { ...settings.reminders, frequencyMinutes: value ?? 120 } })}
              />
            </div>
            {(Object.keys(settings.reminders.modules) as (keyof typeof settings.reminders.modules)[]).map((moduleKey) => (
              <Toggle
                key={moduleKey}
                label={`Remind me about ${moduleKey}`}
                checked={settings.reminders.modules[moduleKey]}
                onChange={(checked) =>
                  void actions.updateSettings({ reminders: { ...settings.reminders, modules: { ...settings.reminders.modules, [moduleKey]: checked } } })
                }
              />
            ))}
          </Card>

          <Card title="System notifications">
            <p className="small">
              Browser notification permission is only ever requested when you press the button below. Status right now:{' '}
              <strong>
                {notificationSupport() === 'unsupported'
                  ? 'not supported in this browser'
                  : notificationSupport() === 'granted'
                    ? 'allowed'
                    : notificationSupport() === 'denied'
                      ? 'blocked by the browser'
                      : 'not requested yet'}
              </strong>
              .
            </p>
            {notificationSupport() === 'unsupported' && (
              <div className="note-banner warn">
                This browser does not offer web notifications - iOS Safari only supports them for apps added to the Home
                Screen. Reminders will appear inside the app instead, which needs no permission at all.
              </div>
            )}
            <div className="row" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={notificationSupport() === 'unsupported' || notificationSupport() === 'denied'}
                onClick={async () => {
                  const result = await requestNotificationPermission();
                  await actions.updateSettings({
                    reminders: { ...settings.reminders, permissionAsked: true, useSystemNotifications: result === 'granted' },
                  });
                  notify(
                    result === 'granted'
                      ? 'System notifications enabled.'
                      : 'Permission was not granted. In-app reminders will be used instead.',
                    result === 'granted' ? 'success' : 'info',
                  );
                }}
              >
                {settings.reminders.permissionAsked ? 'Ask again' : 'Allow system notifications'}
              </button>
              <Toggle
                label="Use system notifications when allowed"
                checked={settings.reminders.useSystemNotifications}
                onChange={(checked) => void actions.updateSettings({ reminders: { ...settings.reminders, useSystemNotifications: checked } })}
              />
            </div>
            <p className="tiny muted">The app never re-prompts on its own; that button is the only thing that asks.</p>
          </Card>
        </TabPanel>
      )}

      {/* --------------------------------------------------------- appearance */}
      {section === 'appearance' && (
        <TabPanel id="appearance">
          <Card title="Theme">
            <Segmented
              label="Colour mode"
              value={settings.themeMode}
              options={[
                { value: 'system' as ThemeMode, label: 'System' },
                { value: 'light' as ThemeMode, label: 'Light' },
                { value: 'dark' as ThemeMode, label: 'Dark' },
              ]}
              onChange={(value) => void actions.updateSettings({ themeMode: value })}
            />
            <Toggle label="Reduce motion" checked={settings.reducedMotion} onChange={(checked) => void actions.updateSettings({ reducedMotion: checked })} hint="Also honoured automatically from your device setting." />
            <Toggle label="Show decorative artwork" checked={settings.showDecorations} onChange={(checked) => void actions.updateSettings({ showDecorations: checked })} />
          </Card>

          <Card title="Page themes" subtitle="Each page has its own colours, background decoration and opacity.">
            {(Object.keys(settings.pageThemes) as PageKey[]).map((pageKey) => {
              const theme = settings.pageThemes[pageKey];
              return (
                <div key={pageKey} className="card" style={{ background: 'var(--card-2)', marginBottom: 10 }}>
                  <div className="row">
                    <strong style={{ textTransform: 'capitalize' }}>{pageKey}</strong>
                    <button
                      type="button"
                      className="btn btn-sm right"
                      onClick={() =>
                        void actions.updateSettings({ pageThemes: { ...settings.pageThemes, [pageKey]: { ...PAGE_THEME_PRESETS[pageKey] } } })
                      }
                    >
                      Reset
                    </button>
                  </div>
                  <div className="grid grid-3" style={{ marginTop: 8 }}>
                    <div className="field">
                      <label htmlFor={`primary-${pageKey}`}>Primary colour</label>
                      <input
                        id={`primary-${pageKey}`}
                        type="color"
                        value={theme.primary}
                        onChange={(event) =>
                          void actions.updateSettings({
                            pageThemes: { ...settings.pageThemes, [pageKey]: { ...theme, primary: hexColour(event.target.value, theme.primary) } },
                          })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`accent-${pageKey}`}>Accent colour</label>
                      <input
                        id={`accent-${pageKey}`}
                        type="color"
                        value={theme.accent}
                        onChange={(event) =>
                          void actions.updateSettings({
                            pageThemes: { ...settings.pageThemes, [pageKey]: { ...theme, accent: hexColour(event.target.value, theme.accent) } },
                          })
                        }
                      />
                    </div>
                    <Select
                      label="Decoration"
                      value={theme.decor}
                      options={[
                        { value: '', label: 'None' },
                        { value: 'mascot-leaf-ninja', label: 'Leaf scout (Naruto slot)' },
                        { value: 'mascot-fruit-spirit', label: 'Fruit spirit (Jujutsu Kaisen slot)' },
                        { value: 'mascot-titan-runner', label: 'Wing runner (Attack on Titan slot)' },
                        { value: 'mascot-grimoire', label: 'Grimoire (Black Clover slot)' },
                        { value: 'mascot-spark', label: 'Progress spark' },
                        { value: 'mascot-pastel-sky', label: 'Pastel sky' },
                      ]}
                      onChange={(value) => void actions.updateSettings({ pageThemes: { ...settings.pageThemes, [pageKey]: { ...theme, decor: value } } })}
                    />
                  </div>
                  <Toggle
                    label="Show this decoration"
                    checked={theme.decorVisible}
                    onChange={(checked) => void actions.updateSettings({ pageThemes: { ...settings.pageThemes, [pageKey]: { ...theme, decorVisible: checked } } })}
                  />
                  <NumberInput
                    label="Decoration opacity"
                    value={Math.round(theme.decorOpacity * 100)}
                    suffix="%"
                    min={4}
                    max={30}
                    onChange={(value) =>
                      void actions.updateSettings({ pageThemes: { ...settings.pageThemes, [pageKey]: { ...theme, decorOpacity: (value ?? 12) / 100 } } })
                    }
                    hint="Kept between 4% and 30% so decoration never competes with the text."
                  />
                </div>
              );
            })}
            <div className="note-banner">
              The bundled artwork is original and anime-inspired. No character art is scraped or hot-linked. Named
              placeholder slots for Naruto, Jujutsu Kaisen, Attack on Titan and Black Clover live in
              <code> public/decor/franchise-placeholders/</code> - replace those files with artwork you own or are licensed
              to use.
            </div>
          </Card>
        </TabPanel>
      )}

      {/* --------------------------------------------------------------- data */}
      {section === 'data' && (
        <TabPanel id="data">
          <Card title="Backup and restore" subtitle={settings.lastExportAt ? `Last export: ${new Date(settings.lastExportAt).toLocaleString()}` : 'You have not exported a backup yet.'}>
            <div className="note-banner warn">
              Your records live in this browser profile only. Clearing site data, switching browser, or resetting the
              device removes them. Export a backup regularly and keep it somewhere you control.
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-primary" onClick={exportJson}>
                Export full JSON backup
              </button>
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                Import a backup…
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="visually-hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                  event.target.value = '';
                }}
              />
            </div>
            <div className="grid grid-2" style={{ marginTop: 12 }}>
              <TextInput
                label="Passphrase for encrypted backups"
                type="password"
                value={passphrase}
                onChange={setPassphrase}
                hint="At least 8 characters. AES-GCM with a PBKDF2-derived key. If you lose the passphrase the file cannot be recovered - there is no reset."
              />
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => void exportEncrypted()}>
                  Export encrypted backup
                </button>
              </div>
            </div>
            <p className="tiny muted" style={{ marginTop: 8 }}>
              Backups carry schema version {BACKUP_SCHEMA_VERSION} and an export timestamp. Imports are validated,
              size-limited, previewed and confirmed before anything is written. Per-module CSV exports live on the
              Analytics page.
            </p>
          </Card>

          <Card title="Demo data" subtitle="A small, obviously labelled sample so you can see the dashboard populated.">
            <div className="row">
              <button
                type="button"
                className="btn"
                disabled={demoCount > 0}
                onClick={async () => {
                  const demo = buildDemoData(todayISO(settings.timeZone), settings.timeZone);
                  await actions.putRecords('taskTemplates', demo.taskTemplates);
                  await actions.putRecords('taskInstances', demo.taskInstances);
                  await actions.putRecords('foodEntries', demo.foodEntries);
                  await actions.putRecords('dayNutrition', demo.dayNutrition);
                  await actions.putRecords('gymSessions', demo.gymSessions);
                  await actions.putRecords('runSessions', demo.runSessions);
                  await actions.putRecords('stepEntries', demo.stepEntries);
                  await actions.putRecords('subjects', demo.subjects);
                  await actions.putRecords('chapters', demo.chapters);
                  await actions.putRecords('studySessions', demo.studySessions);
                  await actions.updateSettings({ demoDataLoaded: true });
                  notify('Demo data loaded. Every demo record is named "DEMO" and can be removed on its own.', 'success');
                }}
              >
                Load demo data
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={demoCount === 0}
                onClick={async () => {
                  await actions.removeRecordsBulk('taskInstances', data.taskInstances.filter(isDemoRecord).map((r) => r.id));
                  await actions.removeRecordsBulk('taskTemplates', data.taskTemplates.filter(isDemoRecord).map((r) => r.id));
                  await actions.removeRecordsBulk('foodEntries', data.foodEntries.filter(isDemoRecord).map((r) => r.id));
                  await actions.removeRecordsBulk('dayNutrition', data.dayNutrition.filter(isDemoRecord).map((r) => r.id));
                  await actions.removeRecordsBulk('gymSessions', data.gymSessions.filter(isDemoRecord).map((r) => r.id));
                  await actions.removeRecordsBulk('runSessions', data.runSessions.filter(isDemoRecord).map((r) => r.id));
                  await actions.removeRecordsBulk('stepEntries', data.stepEntries.filter(isDemoRecord).map((r) => r.id));
                  await actions.removeRecordsBulk('studySessions', data.studySessions.filter(isDemoRecord).map((r) => r.id));
                  await actions.removeRecordsBulk('chapters', data.chapters.filter(isDemoRecord).map((r) => r.id));
                  await actions.removeRecordsBulk('subjects', data.subjects.filter(isDemoRecord).map((r) => r.id));
                  await actions.updateSettings({ demoDataLoaded: false });
                  notify('Demo data removed. Your own records were untouched.', 'success');
                }}
              >
                Remove demo data ({demoCount})
              </button>
            </div>
            <p className="tiny muted" style={{ marginTop: 8 }}>
              Demo records use ids beginning <code>{DEMO_PREFIX}</code> and titles starting with &ldquo;DEMO&rdquo;.
            </p>
          </Card>

          <Card title="Danger zone">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() =>
                setConfirm({
                  title: 'Delete all data?',
                  requireTyping: 'DELETE',
                  message: (
                    <>
                      <p>
                        This permanently removes every task, food entry, workout, run, step count, study session, note and
                        target version from this browser profile.
                      </p>
                      <p>
                        <strong>Backups you have already downloaded are not affected</strong> - files on your device or in
                        your own cloud storage stay exactly where they are. Cloud sync is not enabled in this build, so
                        there is no server copy to delete.
                      </p>
                      <p>Export a backup first if there is any chance you will want this back.</p>
                    </>
                  ),
                  run: async () => {
                    await actions.resetEverything();
                    setConfirm(null);
                    notify('All data deleted from this device.', 'warning');
                  },
                })
              }
            >
              Delete all data…
            </button>
          </Card>
        </TabPanel>
      )}

      {/* ------------------------------------------------------------ privacy */}
      {section === 'privacy' && (
        <TabPanel id="privacy">
          <Card title="How your data is handled">
            <ul className="review-list small">
              <li>Everything is stored in IndexedDB in this browser profile. Nothing is sent anywhere.</li>
              <li>There are no advertisements, analytics, trackers or third-party requests at runtime.</li>
              <li>The only remote request is an optional web-font stylesheet, which falls back to system fonts offline.</li>
              <li>
                IndexedDB is persistent, but it is <strong>not</strong> an encrypted vault: anyone with access to this
                device and browser profile can read it. Your device passcode and profile security still matter.
              </li>
              <li>Encrypted backups use AES-GCM with a PBKDF2-derived key. Lose the passphrase and the file is unrecoverable.</li>
            </ul>
          </Card>

          <Card title="Screen lock">
            <div className="note-banner warn">
              A four-digit PIN here is a <strong>visual screen lock only</strong>. It is not encryption and does not
              protect the stored records from anyone who can open this browser profile.
            </div>
            <Toggle
              label="Require a PIN when the app opens"
              checked={settings.pinEnabled}
              onChange={async (checked) => {
                if (!checked) {
                  await actions.updateSettings({ pinEnabled: false, pinHash: null });
                  notify('Screen lock switched off.', 'info');
                }
                else if (!settings.pinHash) notify('Set a four-digit PIN below to switch the lock on.', 'info');
                else await actions.updateSettings({ pinEnabled: true });
              }}
            />
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <TextInput label="Set a four-digit PIN" type="password" value={pinValue} onChange={(value) => setPinValue(value.replace(/\D/g, '').slice(0, 4))} />
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  if (!isValidPin(pinValue)) {
                    notify('Enter exactly four digits.', 'error');
                    return;
                  }
                  await actions.updateSettings({ pinHash: await hashPin(pinValue), pinEnabled: true });
                  setPinValue('');
                  notify('Screen lock set.', 'success');
                }}
              >
                Save PIN
              </button>
            </div>
            <NumberInput
              label="Lock automatically after inactivity (0 = never)"
              suffix="min"
              value={settings.autoLockMinutes}
              min={0}
              max={240}
              onChange={(value) => void actions.updateSettings({ autoLockMinutes: value ?? 0 })}
            />
          </Card>

          <Card title="Cloud sync">
            <p className="small">
              Optional private cloud sync is <strong>not enabled in this build</strong>, and the app is fully usable
              without it. The wiring it would need is documented in the README, together with the Supabase schema,
              row-level-security policies and the rule that service-role keys stay server-side only. Environment variable
              names live in <code>.env.example</code>; no secret is ever bundled into the client.
            </p>
            <Stat label="Last sync" value={settings.lastSyncAt ? new Date(settings.lastSyncAt).toLocaleString() : 'Never'} sub="Local-first: sync is optional" />
          </Card>

          <Card title="Reload">
            <button type="button" className="btn" onClick={() => void reload()}>
              Reload data from the database
            </button>
          </Card>
        </TabPanel>
      )}

      {/* ------------------------------------------------------------ modals */}

      {versionDraft && (
        <Modal
          title="Target version"
          wide
          onClose={() => setVersionDraft(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setVersionDraft(null)}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={() => setVersionDraft({ ...versionDraft, targets: { ...DEFAULT_TARGETS } })}>
                Reset to defaults
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void saveVersion(versionDraft)}>
                Save
              </button>
            </>
          }
        >
          <div className="stack">
            <TextInput
              label="Effective from"
              type="date"
              value={versionDraft.effectiveFrom}
              onChange={(value) => setVersionDraft({ ...versionDraft, effectiveFrom: value })}
              hint="These targets apply from this date onwards. Days before it keep the targets that were in force then."
            />
            <TextInput label="Note (optional)" value={versionDraft.note ?? ''} onChange={(value) => setVersionDraft({ ...versionDraft, note: value })} />
            <div className="grid grid-3">
              {TARGET_FIELDS.map((field) => (
                <NumberInput
                  key={field.key}
                  label={field.label}
                  suffix={field.suffix}
                  value={versionDraft.targets[field.key]}
                  min={0}
                  max={field.max}
                  onChange={(value) => setVersionDraft({ ...versionDraft, targets: { ...versionDraft.targets, [field.key]: value ?? 0 } })}
                />
              ))}
            </div>
          </div>
        </Modal>
      )}

      {importState && (
        <Modal
          title="Review this import"
          wide
          onClose={() => setImportState(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setImportState(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  exportJson();
                  notify('Current data exported as a safety backup before you continue.', 'success');
                }}
              >
                Back up current data first
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  await actions.importSnapshot(importState.preview.payload, importState.mode);
                  notify(
                    `Restore complete: ${importState.preview.totals.added} added, ${importState.preview.totals.updated} updated, ${importState.preview.totals.invalid} invalid record(s) skipped.`,
                    'success',
                  );
                  setImportState(null);
                }}
              >
                {importState.mode === 'replace' ? 'Replace everything' : 'Merge into my data'}
              </button>
            </>
          }
        >
          <div className="stack">
            <div className="note-banner">
              Backup exported {importState.preview.exportedAt ? new Date(importState.preview.exportedAt).toLocaleString() : 'at an unknown time'} ·
              schema version {importState.preview.schemaVersion}
            </div>
            <Segmented
              label="Import mode"
              value={importState.mode}
              options={[
                { value: 'merge' as const, label: 'Merge (keep my records)' },
                { value: 'replace' as const, label: 'Replace everything' },
              ]}
              onChange={(value) => setImportState({ ...importState, mode: value })}
            />
            {importState.mode === 'replace' && (
              <div className="note-banner danger">
                Replace clears each store in the backup and writes the backup contents instead. Use{' '}
                <strong>Back up current data first</strong> before you continue.
              </div>
            )}
            <div className="table-wrap">
              <table>
                <caption>What this import would do</caption>
                <thead>
                  <tr>
                    <th scope="col">Store</th>
                    <th scope="col">Added</th>
                    <th scope="col">Updated</th>
                    <th scope="col">Invalid (skipped)</th>
                  </tr>
                </thead>
                <tbody>
                  {importState.preview.perStore.map((row) => (
                    <tr key={row.store}>
                      <th scope="row">{row.store}</th>
                      <td>{row.added}</td>
                      <td>{row.updated}</td>
                      <td>{row.invalid}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">Total</th>
                    <td>{importState.preview.totals.added}</td>
                    <td>{importState.preview.totals.updated}</td>
                    <td>{importState.preview.totals.invalid}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          requireTyping={confirm.requireTyping}
          onConfirm={confirm.run}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
