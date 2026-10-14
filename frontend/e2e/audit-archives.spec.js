import { expect, test } from '@playwright/test';
import { USERS, expectToast, panel, signIn } from './helpers';

/** Create and archive an "E2E check …" project through the Projects page (same steps as admin-projects). */
async function archiveSampleProject(page) {
  const name = `E2E check ${new Date().toISOString().slice(0, 16)}`;
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  await panel(page).getByLabel('Project name').fill(name);
  await panel(page).getByLabel('Predicted end date').fill('2027-06-30');
  await panel(page).getByLabel('Planned budget (USD)').fill('12000');
  await panel(page).getByRole('button', { name: 'Create project' }).click();
  await expectToast(page, 'created');
  await panel(page).getByRole('button', { name: 'Archive project' }).click();
  await panel(page).getByRole('button', { name: 'Confirm archive' }).click();
  await expectToast(page, 'archived');
}

test('admin reviews an archive event and restores the project from Archives', async ({ page }) => {
  await signIn(page, USERS.admin);

  // The admin-projects flow leaves an archived "E2E check …" project behind; make one if it has not run.
  await page.goto('/archives');
  await expect(page.getByRole('heading', { level: 1, name: 'Archives' })).toBeVisible();
  await page.getByPlaceholder('Search archives…').fill('E2E check');
  await expect(page.getByText(/Archived records/)).toBeVisible();
  await page.waitForLoadState('networkidle');
  if ((await page.getByRole('row', { name: /E2E check/ }).count()) === 0) {
    await archiveSampleProject(page);
  }

  // Audit activity: filter by action, open the before / after panel of an archive event.
  await page.goto('/audit');
  await expect(page.getByRole('heading', { level: 1, name: 'Audit activity' })).toBeVisible();
  await page.getByRole('combobox', { name: /Filter by action/ }).click();
  await page.getByRole('option', { name: 'Archived' }).click();
  const archivedRows = page.getByRole('row', { name: /Archived project E2E check/ });
  await expect(archivedRows.first()).toBeVisible();
  await archivedRows.first().getByRole('button', { name: 'View change' }).click();
  const details = panel(page);
  await expect(details.getByRole('heading', { name: 'Audit event details' })).toBeVisible();
  await expect(details.getByText(/Archived project E2E check/)).toBeVisible();
  await expect(details.getByRole('columnheader', { name: 'Field' })).toBeVisible();
  await expect(details.getByRole('columnheader', { name: 'Before' })).toBeVisible();
  await expect(details.getByRole('columnheader', { name: 'After' })).toBeVisible();
  const change = details.getByRole('row', { name: /is_archived/ });
  await expect(change.getByRole('cell').nth(1)).toHaveText('false');
  await expect(change.getByRole('cell').nth(2)).toHaveText('true');
  await expect(details.getByText('Read-only event. Original and changed values stay recorded.')).toBeVisible();

  // Archives: restore the newest archived E2E project and see it leave the list.
  await page.goto('/archives');
  await page.getByPlaceholder('Search archives…').fill('E2E check');
  const row = page.getByRole('row', { name: /E2E check/ }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText('by Ada Admin')).toBeVisible();
  await row.getByRole('button', { name: 'Restore record' }).click();
  await expect(panel(page).getByRole('heading', { name: 'Restore archived record?' })).toBeVisible();
  await expect(panel(page).getByText(/E2E check/)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Confirm restore' }).click();

  const toast = page.getByRole('status').filter({ hasText: /E2E check .* restored/ });
  await expect(toast).toBeVisible();
  const [, name] = (await toast.innerText()).match(/^[A-Z]{3}-\d{3} (E2E check .+) restored$/);
  await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);

  // The restored project is back in the active register.
  await page.goto('/projects');
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
});
