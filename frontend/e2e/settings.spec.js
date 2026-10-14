import { test, expect } from '@playwright/test';
import { signIn, expectToast } from './helpers.js';

/**
 * Settings (EMPLOYEE.md §6.6): the employee changes their own last name, the sidebar shows the
 * new name at once, then the name goes back so the flow is repeatable.
 */
const EMPLOYEE = { username: 'emp001', password: 'Employee123!' };

async function saveLastName(page, lastName) {
  const lastNameField = page.getByLabel('Last name');
  await lastNameField.fill(lastName);
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expectToast(page, 'Profile saved');
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled(); // saved: nothing left to change
}

test('employee renames themselves on Settings, sees the sidebar update, then changes it back', async ({ page }) => {
  await signIn(page, EMPLOYEE);
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByLabel('First name')).toHaveValue('Sam');
  await expect(page.getByLabel('Last name')).toHaveValue('Rivera');
  await expect(page.getByLabel('Email address')).toHaveValue('sam.rivera@acme.test');
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled(); // nothing changed yet

  await saveLastName(page, 'Rivera-E2E');
  await expect(page.getByRole('navigation').getByText('Sam Rivera-E2E')).toBeVisible();

  // Back to the seeded name, so the next run starts from the same place.
  await saveLastName(page, 'Rivera');
  await expect(page.getByRole('navigation').getByText('Sam Rivera', { exact: true })).toBeVisible();
  await expect(page.getByText('Sam Rivera-E2E')).toHaveCount(0);
});
