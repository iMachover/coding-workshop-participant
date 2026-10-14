import { expect, test } from '@playwright/test';
import { USERS, expectToast, panel, signIn } from './helpers';

const TASK = 'Validate backups after migration'; // seeded for emp003 in INF-024's open milestone

test.describe.serial('task workflow', () => {
  test('employee starts and submits a task from the Overview', async ({ page }) => {
    await signIn(page, USERS.employee);
    await page.getByRole('row', { name: new RegExp(TASK) }).click();
    await expect(panel(page).getByRole('heading', { name: TASK })).toBeVisible();

    // Repeatable on the same database: start if still assigned, submit unless already submitted.
    const start = panel(page).getByRole('button', { name: 'Start task' });
    if (await start.isVisible()) {
      await start.click();
      await expectToast(page, 'Task started');
    }
    const submit = panel(page).getByRole('button', { name: 'Submit for approval' });
    if (await submit.isVisible()) {
      await submit.click();
      await expectToast(page, 'Submitted to');
    }
    await expect(panel(page).getByText('Completion requested')).toBeVisible();
    await expect(panel(page).getByRole('button', { name: /Submit|Start/ })).toHaveCount(0);
  });

  test('manager approves the submission, then reopens it', async ({ page }) => {
    await signIn(page, USERS.manager);
    // The review queue lists every submitted task; open the one the employee just submitted.
    const queueItem = page.getByText(TASK, { exact: true }).locator('..');
    await queueItem.getByRole('button', { name: 'Review submission' }).click();
    await expect(panel(page).getByRole('heading', { name: 'Review completion request' })).toBeVisible();
    await expect(panel(page).getByRole('heading', { name: TASK })).toBeVisible();
    await panel(page).getByRole('button', { name: 'Approve completion' }).click();
    await expectToast(page, 'Task approved');
    await expect(panel(page).getByText('Completed')).toBeVisible();

    await panel(page).getByRole('button', { name: 'Reopen task' }).click();
    await expectToast(page, 'Task reopened');
    await expect(panel(page).getByText('In progress')).toBeVisible();
  });
});
