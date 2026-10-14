import { expect, test } from '@playwright/test';
import { expectToast, panel, signIn } from './helpers';

const EMPLOYEE = { username: 'emp001', password: 'Employee123!' }; // seeded with a task in progress
const TASK = /Migrate file services to new cluster/;
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const note = `E2E hours ${stamp}`;

/** Today as YYYY-MM-DD in the browser's local time (the API refuses future dates). */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('employee logs hours from the Overview, corrects the entry on My hours, then removes it', async ({ page }) => {
  await signIn(page, EMPLOYEE);
  await page.getByRole('button', { name: 'Log hours' }).click();
  await expect(page).toHaveURL(/\?log=0/);
  const log = page.getByRole('dialog', { name: 'Log hours' });
  await log.getByRole('combobox', { name: 'Task' }).click();
  await page.getByRole('option', { name: TASK }).click();
  await log.getByLabel('Date').fill(today());
  await log.getByLabel('Hours').fill('1.5');
  await log.getByLabel('Work note').fill(note);
  await log.getByRole('button', { name: 'Log hours' }).click();
  await expectToast(page, '1.5 h logged on TSK-');
  await expect(log).toHaveCount(0);

  // The entry is on My hours, in this week's ledger, and can still be corrected.
  await page.getByRole('link', { name: 'My hours' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'My hours' })).toBeVisible();
  await page.getByPlaceholder('Search logged work…').fill(note);
  const row = page.getByRole('row', { name: new RegExp(note) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('1.5 h');
  await row.getByRole('button', { name: 'View / correct' }).click();
  await expect(panel(page).getByRole('heading', { name: 'Correct time entry' })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Save correction' })).toBeDisabled(); // nothing changed yet
  await panel(page).getByLabel('Hours').fill('2');
  await panel(page).getByRole('button', { name: 'Save correction' }).click();
  await expectToast(page, 'Time entry corrected');
  await expect(row).toContainText('2 h');

  // Remove it again so the flow is repeatable: a wrong click does nothing, the confirmation does.
  await row.getByRole('button', { name: 'View / correct' }).click();
  await panel(page).getByRole('button', { name: 'Remove entry' }).click();
  await expect(panel(page).getByRole('group', { name: 'Confirm removal' })).toBeVisible();
  await panel(page).getByRole('group', { name: 'Confirm removal' }).getByRole('button', { name: 'Cancel' }).click();
  await expect(panel(page).getByRole('group', { name: 'Confirm removal' })).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'Remove entry' }).click();
  await panel(page).getByRole('button', { name: 'Confirm removal' }).click();
  await expectToast(page, '2 h removed from TSK-');
  await expect(page.getByRole('row', { name: new RegExp(note) })).toHaveCount(0);
});
