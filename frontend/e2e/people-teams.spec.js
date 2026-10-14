import { expect, test } from '@playwright/test';
import { USERS, expectToast, panel, signIn } from './helpers';

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

test('admin creates an account, sees the credentials once, then archives it', async ({ page }) => {
  await signIn(page, USERS.admin);
  await page.getByRole('link', { name: 'Create user' }).click(); // Overview → People with the panel open
  await expect(page).toHaveURL(/\/people\?create=1/);
  await panel(page).getByLabel('First name').fill('E2E');
  await panel(page).getByLabel('Last name').fill(`Person ${stamp}`);
  await panel(page).getByLabel('Email address').fill(`e2e.person.${stamp}@acme.test`);
  await panel(page).getByLabel('Hourly rate (USD)').fill('50');
  await panel(page).getByLabel('Temporary password').fill('Welcome123!');
  await panel(page).getByRole('button', { name: 'Create account' }).click();

  const dialog = page.getByRole('dialog', { name: /Account created/ });
  await expect(dialog).toBeVisible();
  const username = await dialog.locator('p:has-text("Username") + p').textContent();
  expect(username).toMatch(/^[a-z0-9]{6}$/);
  await dialog.getByRole('button', { name: 'Done' }).click();

  await page.getByPlaceholder('Search people…').fill(`Person ${stamp}`);
  const row = page.getByRole('row', { name: new RegExp(`Person ${stamp}`) });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'View profile' }).click();
  await expect(panel(page).getByText(username, { exact: true })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Archive account' }).click();
  await panel(page).getByRole('button', { name: 'Confirm archive' }).click();
  await expectToast(page, 'archived');
  await expect(panel(page).getByRole('button', { name: 'Restore account' })).toBeVisible();
});

test('manager creates a team on a project, then detaches it', async ({ page }) => {
  const name = `E2E team ${stamp}`;
  await signIn(page, USERS.manager);
  await page.getByRole('link', { name: 'My team' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'My team' })).toBeVisible();
  await page.getByRole('button', { name: 'Create team' }).click();
  await panel(page).getByLabel('Team name').fill(name);
  await panel(page).getByLabel('Members').click();
  await page.getByRole('option', { name: /Jordan Okafor/ }).click();
  await page.keyboard.press('Escape');
  await panel(page).getByLabel('Assigned project').click();
  await page.getByRole('option', { name: /INF-024/ }).click();
  await panel(page).getByRole('button', { name: 'Create team' }).click();
  await expectToast(page, 'created');

  const card = page.getByText(name, { exact: true }).locator('..');
  await expect(card.getByText(/INF-024/)).toBeVisible();
  await card.locator('..').getByRole('button', { name: 'Manage team' }).click();
  await expect(panel(page).getByRole('heading', { name: new RegExp(name) })).toBeVisible();
  await panel(page).getByLabel('Detach INF-024').click();
  await expect(panel(page).getByRole('group', { name: 'Confirm removal' })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Cancel' }).click(); // a wrong click does nothing
  await expect(panel(page).getByText(/INF-024/)).toBeVisible();
  await panel(page).getByLabel('Detach INF-024').click();
  await panel(page).getByRole('button', { name: 'Confirm removal' }).click();
  await expectToast(page, 'removed from INF-024');
  await expect(panel(page).getByText('Not attached to a project yet')).toBeVisible();
});

test('manager takes an unassigned employee on from the employee list, then releases them', async ({ page }) => {
  await signIn(page, USERS.manager);
  await page.getByRole('link', { name: 'My team' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'My team' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Direct reports' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Alex Kim/ })).toHaveCount(0); // seeded unassigned

  await page.getByRole('button', { name: 'Assign employee' }).click();
  await panel(page).getByLabel('Employee').click();
  await expect(page.getByRole('option', { name: /Casey Nguyen/ })).toHaveAttribute('aria-disabled', 'true'); // another manager's
  await page.getByRole('option', { name: /Alex Kim/ }).click();
  await panel(page).getByLabel('Team').click();
  await page.getByRole('option', { name: 'No team yet' }).click();
  await panel(page).getByRole('button', { name: 'Add as direct report' }).click();
  await expectToast(page, 'now reports to you');

  const row = page.getByRole('row', { name: /Alex Kim/ });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'View profile' }).click();
  await expect(panel(page).getByText('Morgan Lee')).toBeVisible(); // Reports to
  await panel(page).getByRole('button', { name: 'Release from your reports' }).click();
  await expect(panel(page).getByRole('group', { name: 'Confirm release' })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Confirm release' }).click();
  await expectToast(page, 'released');
  await expect(page.getByRole('row', { name: /Alex Kim/ })).toHaveCount(0);
});

test('employee sees their team, its current milestone and their manager', async ({ page }) => {
  await signIn(page, { username: 'emp001', password: 'Employee123!' }); // seeded with work in progress
  await page.getByRole('link', { name: 'My teams' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'My teams' })).toBeVisible();
  const row = page.getByRole('row', { name: /Server Ops/ });
  await expect(row.getByText('Your active team')).toBeVisible();
  await expect(row.getByText('Workload migration')).toBeVisible();
  await page.getByRole('combobox', { name: /Filter by state/ }).click();
  await page.getByRole('option', { name: 'No work in progress' }).click();
  await expect(page.getByRole('row', { name: /Server Ops/ })).toHaveCount(0);
  await page.getByRole('combobox', { name: /Filter by state/ }).click();
  await page.getByRole('option', { name: 'Active' }).click();
  await row.getByRole('button', { name: 'View team' }).click();
  await expect(page).toHaveURL(/\/teams\?team=\d+/);
  await expect(panel(page).getByText('Sam Rivera (you)')).toBeVisible();
  await expect(panel(page).getByText('Workload migration')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Your manager' }).getByText('Morgan Lee')).toBeVisible();
  await expect(page.getByText(/\$/)).toHaveCount(0); // never a teammate's cost
});
