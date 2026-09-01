import { describe, expect, it } from 'vitest';
import { clearAllData, loadSnapshot, replaceCollections, saveRecord, saveRecords, deleteRecord } from '../src/db/repo';
import { closeDb } from '../src/db/schema';
import { buildBackup, previewImport, encryptBackup, decryptBackup, isEncryptedBackup, BACKUP_FORMAT } from '../src/lib/backup';
import { RECORD_SCHEMA_VERSION } from '../src/types/models';
import type { FoodEntry, TaskInstance } from '../src/types/models';

const NOW = '2026-09-01T06:00:00.000Z';
const TZ = 'Asia/Karachi';
const base = { createdAt: NOW, updatedAt: NOW, v: RECORD_SCHEMA_VERSION };

function task(id: string, date: string, overrides: Partial<TaskInstance> = {}): TaskInstance {
  return {
    ...base, id, date, tz: TZ, templateId: null, title: `Task ${id}`, description: '', category: 'Routine',
    dueTime: null, estimatedMinutes: null, priority: 'medium', mandatory: false, notes: '', status: 'pending',
    completedAt: null, order: 0, carriedToDate: null, carriedFromId: null, ...overrides,
  };
}

function food(id: string, date: string, calories: number): FoodEntry {
  return {
    ...base, id, date, tz: TZ, meal: 'Lunch', name: 'Meal', quantity: '1 serving',
    calories, protein: 30, carbs: 40, fat: 10, fibre: 5, time: '13:00', notes: '',
  };
}

/** Simulates closing and reopening the app. */
async function reopen() {
  await closeDb();
  return loadSnapshot();
}

describe('local persistence', () => {
  it('creates first-run settings and an initial target version', async () => {
    const snapshot = await loadSnapshot();
    expect(snapshot.settings.id).toBe('settings');
    expect(snapshot.targetVersions).toHaveLength(1);
    expect(snapshot.studyTimer.id).toBe('study-timer');
  });

  it('keeps records after a reload', async () => {
    await loadSnapshot();
    await saveRecord('taskInstances', task('t1', '2026-09-01'));
    await saveRecord('foodEntries', food('f1', '2026-09-01', 640));

    const reloaded = await reopen();
    expect(reloaded.taskInstances).toHaveLength(1);
    expect(reloaded.taskInstances[0].title).toBe('Task t1');
    expect(reloaded.foodEntries[0].calories).toBe(640);
  });

  it('edits and deletes without touching other days', async () => {
    await loadSnapshot();
    await saveRecords('taskInstances', [task('t1', '2026-09-01'), task('t2', '2026-09-02')]);
    await saveRecord('taskInstances', task('t1', '2026-09-01', { status: 'completed' }));
    await deleteRecord('taskInstances', 't2');

    const reloaded = await reopen();
    expect(reloaded.taskInstances).toHaveLength(1);
    expect(reloaded.taskInstances[0].status).toBe('completed');
    expect(reloaded.taskInstances[0].date).toBe('2026-09-01');
  });

  it('never overwrites a previous day when a new day is written', async () => {
    await loadSnapshot();
    await saveRecord('foodEntries', food('f1', '2026-09-01', 500));
    await saveRecord('foodEntries', food('f2', '2026-09-02', 900));

    const reloaded = await reopen();
    const byDate = new Map(reloaded.foodEntries.map((entry) => [entry.date, entry.calories]));
    expect(byDate.get('2026-09-01')).toBe(500);
    expect(byDate.get('2026-09-02')).toBe(900);
  });

  it('stamps updatedAt on every write', async () => {
    await loadSnapshot();
    const stored = await saveRecord('taskInstances', task('t1', '2026-09-01'));
    expect(Date.parse(stored.updatedAt)).toBeGreaterThan(Date.parse(NOW));
    expect(stored.v).toBe(RECORD_SCHEMA_VERSION);
  });
});

describe('backup, restore and portability', () => {
  it('exports, clears, and restores an equivalent database', async () => {
    await loadSnapshot();
    await saveRecords('taskInstances', [task('t1', '2026-09-01', { status: 'completed' }), task('t2', '2026-09-02')]);
    await saveRecord('foodEntries', food('f1', '2026-09-01', 700));
    const original = await reopen();

    const backup = buildBackup(original);
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.exportedAt).toBeTruthy();

    await clearAllData();
    const emptied = await reopen();
    expect(emptied.taskInstances).toHaveLength(0);
    expect(emptied.foodEntries).toHaveLength(0);

    const preview = previewImport(JSON.parse(JSON.stringify(backup)), emptied);
    expect(preview.ok).toBe(true);
    expect(preview.totals.invalid).toBe(0);
    expect(preview.totals.added).toBeGreaterThanOrEqual(3);

    await replaceCollections(preview.payload);
    const restored = await reopen();
    expect(restored.taskInstances).toHaveLength(2);
    expect(restored.taskInstances.find((item) => item.id === 't1')?.status).toBe('completed');
    expect(restored.foodEntries[0].calories).toBe(700);
  });

  it('rejects a file that is not one of our backups', async () => {
    const snapshot = await loadSnapshot();
    expect(previewImport({ hello: 'world' }, snapshot).ok).toBe(false);
    expect(previewImport(null, snapshot).ok).toBe(false);
    expect(previewImport({ format: BACKUP_FORMAT, schemaVersion: 99, data: {} }, snapshot).error).toContain('newer');
  });

  it('counts invalid records instead of importing them', async () => {
    const snapshot = await loadSnapshot();
    const preview = previewImport(
      {
        format: BACKUP_FORMAT,
        schemaVersion: 1,
        exportedAt: NOW,
        appVersion: '1.0.0',
        data: {
          taskInstances: [
            task('good', '2026-09-01'),
            { id: 'bad', title: 'no date' },
            { id: 'bad2', createdAt: NOW, updatedAt: NOW, date: 'nonsense', tz: TZ, title: 'x', status: 'pending' },
          ],
          foodEntries: [{ ...food('negative', '2026-09-01', -50) }],
        },
      },
      snapshot,
    );
    expect(preview.ok).toBe(true);
    const tasks = preview.perStore.find((row) => row.store === 'taskInstances');
    expect(tasks).toMatchObject({ added: 1, invalid: 2 });
    expect(preview.perStore.find((row) => row.store === 'foodEntries')).toMatchObject({ added: 0, invalid: 1 });
  });

  it('detects duplicates as updates rather than additions', async () => {
    await loadSnapshot();
    await saveRecord('taskInstances', task('t1', '2026-09-01'));
    const snapshot = await reopen();
    const preview = previewImport(JSON.parse(JSON.stringify(buildBackup(snapshot))), snapshot);
    expect(preview.perStore.find((row) => row.store === 'taskInstances')).toMatchObject({ added: 0, updated: 1 });
  });

  it('round-trips a passphrase-encrypted backup', async () => {
    await loadSnapshot();
    await saveRecord('taskInstances', task('t1', '2026-09-01'));
    const snapshot = await reopen();

    const encrypted = await encryptBackup(buildBackup(snapshot), 'correct horse battery');
    expect(isEncryptedBackup(encrypted)).toBe(true);
    expect(JSON.stringify(encrypted)).not.toContain('Task t1');

    const decrypted = await decryptBackup(encrypted, 'correct horse battery');
    expect((decrypted.data.taskInstances as TaskInstance[])[0].title).toBe('Task t1');

    await expect(decryptBackup(encrypted, 'wrong passphrase')).rejects.toThrow(/Could not decrypt/);
  });
});
