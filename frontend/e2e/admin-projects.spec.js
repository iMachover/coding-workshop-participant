import { expect, test } from '@playwright/test';
import { USERS, expectToast, panel, signIn } from './helpers';

test('admin creates a project and archives it', async ({ page }) => {
  const name = `E2E check ${new Date().toISOString().slice(0, 16)}`;
  await signIn(page, USERS.admin);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  await panel(page).getByLabel('Project name').fill(name);
  await panel(page).getByLabel('Predicted end date').fill('2027-06-30');
  await panel(page).getByLabel('Planned budget (USD)').fill('12000');
  await panel(page).getByRole('button', { name: 'Create project' }).click();
  await expectToast(page, 'created');
  await expect(panel(page).getByRole('heading', { name })).toBeVisible();
  await expect(panel(page).getByText('No team assigned')).toBeVisible();

  await panel(page).getByRole('button', { name: 'Archive project' }).click();
  await panel(page).getByRole('button', { name: 'Confirm archive' }).click();
  await expectToast(page, 'archived');
  await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);
});
