import { expect, test } from '@playwright/test';
import { USERS, panel, signIn } from './helpers';

test('manager reads Reports and opens a project from Hours by project', async ({ page }) => {
  await signIn(page, USERS.manager);
  await page.getByRole('link', { name: 'Reports' }).first().click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();

  // The four stat cards: cost, budget, hours, over-allocated people.
  for (const label of ['Actual project cost', 'Total budget', 'Hours', 'Over-allocated people']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByText(/Nobody above 40/)).toBeVisible();

  // Five weekly bars, described for screen readers.
  const chart = page.getByRole('img', { name: /^Weekly labour cost/ });
  await expect(chart).toBeVisible();
  expect((await chart.getAttribute('aria-label')).match(/week of/g)).toHaveLength(5);

  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Review projects' })).toBeVisible();

  // Selecting a row under Hours by project opens the project panel.
  await page.getByRole('button', { name: 'Open project Legacy server retirement' }).click();
  await expect(page).toHaveURL(/selected=\d+/);
  await expect(panel(page).getByRole('heading', { name: 'Legacy server retirement' })).toBeVisible();
});
