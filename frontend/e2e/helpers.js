import { expect } from '@playwright/test';

/** Seeded accounts (LOGIN.md). */
export const USERS = {
  admin: { username: 'adm001', password: 'Admin123!' },
  manager: { username: 'mgr001', password: 'Manager123!' },
  employee: { username: 'emp003', password: 'Employee123!' },
};

/** Sign in through the login page and wait for the Overview to render. */
export async function signIn(page, { username, password }) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await page.waitForLoadState('networkidle');
}

/** The side panel currently on top. */
export const panel = (page) => page.getByRole('dialog').last();

/** Wait for the bottom-centre confirmation toast carrying `text`. */
export async function expectToast(page, text) {
  await expect(page.getByRole('status').filter({ hasText: text })).toBeVisible();
}
