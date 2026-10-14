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
  // The people picker lists the manager's own and unassigned employees; pick one of each.
  const members = panel(page).getByRole('list', { name: 'Members' });
  await members.getByRole('checkbox', { name: /Jordan Okafor/ }).click();
  await expect(members.getByRole('checkbox', { name: /Jordan Okafor/ })).toHaveAttribute('aria-selected', 'true');
  await expect(panel(page).getByRole('button', { name: 'Jordan Okafor', exact: true })).toBeVisible(); // the picked chip
  await panel(page).getByLabel('Assigned project').click();
  await page.getByRole('option', { name: /INF-024/ }).click();
  await panel(page).getByRole('button', { name: 'Create team' }).click();
  await expectToast(page, 'created');

  const card = page.getByText(name, { exact: true }).locator('..');
  await expect(card.getByText(/INF-024/)).toBeVisible();
  await expect(card.getByText(/Jordan Okafor/)).toBeVisible();
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
  const reports = page.getByRole('region', { name: 'Direct reports' });
  await expect(reports).toBeVisible();
  await expect(reports.getByRole('row').first()).toBeVisible();
  if (await reports.getByRole('row', { name: /Alex Kim/ }).count()) {
    await releaseAlex(page); // a previous run stopped before releasing them; start from the seed
  }
  await expect(reports.getByRole('row', { name: /Alex Kim/ })).toHaveCount(0); // seeded unassigned

  await page.getByRole('button', { name: 'Assign employee' }).click();
  await panel(page).getByRole('combobox', { name: 'Team' }).click();
  await page.getByRole('option', { name: 'No team yet' }).click();
  // The picker offers only the manager's own and unassigned employees; another manager's never appear.
  const picker = panel(page).getByRole('list', { name: 'Employee' });
  const alex = picker.getByRole('option', { name: /Alex Kim/ });
  await expect(alex).toBeVisible();
  await expect(alex).toContainText('Unassigned');
  await expect(picker.getByRole('option', { name: /Sam Rivera/ })).toContainText('Reports to you');
  await expect(picker.getByRole('option', { name: /Casey Nguyen/ })).toHaveCount(0);
  await alex.click();
  await expect(panel(page).getByText('Alex Kim becomes your direct report.')).toBeVisible();
  await panel(page).getByRole('button', { name: 'Add as direct report' }).click();
  await expectToast(page, 'now reports to you');

  await expect(reports.getByRole('row', { name: /Alex Kim/ })).toBeVisible();
  await releaseAlex(page);
  await expect(reports.getByRole('row', { name: /Alex Kim/ })).toHaveCount(0);
});

/** From the My team page: open Alex Kim's profile and release them back to the unassigned pool. */
async function releaseAlex(page) {
  const row = page.getByRole('region', { name: 'Direct reports' }).getByRole('row', { name: /Alex Kim/ });
  await row.getByRole('button', { name: 'View profile' }).click();
  await expect(panel(page).getByText('Morgan Lee')).toBeVisible(); // Reports to
  await panel(page).getByRole('button', { name: 'Release from your reports' }).click();
  await expect(panel(page).getByRole('group', { name: 'Confirm release' })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Confirm release' }).click();
  await expectToast(page, 'released');
}

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
