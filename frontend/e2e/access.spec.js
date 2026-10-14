import { expect, test } from '@playwright/test';
import { USERS, signIn } from './helpers';

test('signed-out visitors are sent to the login page', async ({ page }) => {
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/login/);
});

test('an employee sees only employee pages and cannot open admin pages', async ({ page }) => {
  await signIn(page, USERS.employee);
  const nav = page.locator('nav[aria-label="Main"]').first();
  await expect(nav.getByRole('link')).toHaveText(['Overview', 'My projects', 'My teams', 'My hours', 'Settings']);
  await page.goto('/audit');
  await expect(page.getByText(/This page isn.t available for your role/)).toBeVisible();
});
