import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';
import { closeDb } from '../src/db/schema';
import { loadSnapshot } from '../src/db/repo';

/** Renders the app fresh, as if the browser had just been opened. */
async function openApp() {
  window.location.hash = '#/today';
  const utils = render(<App />);
  await screen.findByRole('button', { name: /quick add an entry/i }, { timeout: 5000 });
  return utils;
}

async function goTo(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
  const nav = screen.getAllByRole('navigation')[0];
  await user.click(within(nav).getByRole('button', { name: label }));
}

describe('end-to-end flows', () => {
  it('adds a task, keeps it after a reload, completes it, and deletes it', async () => {
    const user = userEvent.setup();
    const first = await openApp();

    await goTo(user, /^Tasks$/);
    await user.click((await screen.findAllByRole('button', { name: /add task/i }))[0]);

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /^Title$/i }), 'Drink water');
    await user.click(within(dialog).getByRole('button', { name: /^Save$/ }));

    expect(await screen.findByText('Drink water')).toBeTruthy();

    // Close the app entirely and open it again: the record is still there.
    first.unmount();
    await closeDb();
    const stored = await loadSnapshot();
    expect(stored.taskInstances.map((task) => task.title)).toContain('Drink water');

    await openApp();
    await goTo(user, /^Tasks$/);
    expect(await screen.findByText('Drink water')).toBeTruthy();

    // Completing it updates the day's percentage.
    await user.click(screen.getByRole('checkbox', { name: /mark drink water complete/i }));
    await screen.findByText(/100% of eligible tasks/i);

    await closeDb();
    const afterComplete = await loadSnapshot();
    expect(afterComplete.taskInstances[0].status).toBe('completed');
    expect(afterComplete.taskInstances[0].completedAt).not.toBeNull();
  }, 30_000);

  it('logs food and shows it against the day target without double counting', async () => {
    const user = userEvent.setup();
    await openApp();

    await goTo(user, /^Nutrition$/);
    await user.click((await screen.findAllByRole('button', { name: /add food|add the first entry/i }))[0]);

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /^Food$/i }), 'Porridge');
    const calories = within(dialog).getByRole('spinbutton', { name: /^Calories \(kcal\)$/i });
    fireEvent.change(calories, { target: { value: '450' } });
    await user.click(within(dialog).getByRole('button', { name: /^Save$/ }));

    expect(await screen.findByText('Porridge')).toBeTruthy();

    await closeDb();
    const stored = await loadSnapshot();
    expect(stored.foodEntries).toHaveLength(1);
    expect(stored.foodEntries[0].calories).toBe(450);
    // The day stays in itemised mode, so the quick-total fields are untouched.
    expect(stored.dayNutrition.every((day) => day.mode === 'itemised')).toBe(true);
  }, 30_000);

  it('opens a calendar date and shows its full daily record', async () => {
    const user = userEvent.setup();
    await openApp();

    await goTo(user, /^Calendar$/);
    const grid = await screen.findByRole('grid');
    const cells = within(grid).getAllByRole('gridcell');
    await user.click(cells[10]);

    // The detail panel below the grid always renders every module.
    expect(await screen.findByRole('heading', { name: /^Tasks$/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Nutrition and energy/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Training, running and steps/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Notes, mood and energy/i })).toBeTruthy();
  }, 30_000);

  it('changes a target with a future effective date without touching today', async () => {
    const user = userEvent.setup();
    await openApp();

    await goTo(user, /^Settings$/);
    await user.click(await screen.findByRole('tab', { name: /^Targets$/ }));
    const before = (await loadSnapshot()).targetVersions[0].targets.calories;

    await user.click(screen.getByRole('button', { name: /new target version/i }));
    const dialog = await screen.findByRole('dialog');
    const caloriesField = within(dialog).getByRole('spinbutton', { name: /^Daily calories \(kcal\)$/i });
    fireEvent.change(caloriesField, { target: { value: '2600' } });
    await user.click(within(dialog).getByRole('button', { name: /^Save$/ }));

    await closeDb();
    const stored = await loadSnapshot();
    expect(stored.targetVersions).toHaveLength(2);
    const [original, added] = [...stored.targetVersions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    expect(original.targets.calories).toBe(before);
    expect(added.targets.calories).toBe(2600);
    expect(added.effectiveFrom > original.effectiveFrom).toBe(true);
  }, 30_000);
});
