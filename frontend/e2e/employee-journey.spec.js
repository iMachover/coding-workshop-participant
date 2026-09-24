import { expect, test } from '@playwright/test'

import { choose, PASSWORD, uniqueEmail } from './helpers.js'

/**
 * The critical employee path, end to end through the UI:
 * register -> sign in -> create a ticket (recorded as opened) -> add a note -> escalate -> see it on the
 * dashboard -> add a note from there -> filter and search -> sign out.
 */
test('an employee reports an issue and follows it through', async ({ page }) => {
  const email = uniqueEmail('jordan')
  const title = `Desk lamp flickers ${Date.now()}`

  // How the browser identifies itself on every protected API call.
  const authHeaders = []
  page.on('request', (request) => {
    if (request.url().includes('/api/core/tickets')) authHeaders.push(request.headers())
  })

  // Every tickets API response the browser gets, to check what the employee receives.
  const ticketResponses = []
  page.on('response', async (response) => {
    if (response.url().includes('/api/core/tickets') && response.request().method() !== 'OPTIONS') {
      ticketResponses.push(await response.text())
    }
  })

  await test.step('register with a company email', async () => {
    await page.goto('/register')
    await page.getByLabel(/^Full name/).fill('Jordan Lee')
    await page.getByLabel(/^Work email/).fill(email)
    await page.getByLabel(/^Password/).fill(PASSWORD)
    await page.getByLabel(/^Confirm password/).fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('alert')).toHaveText(`Account created for ${email}. Please sign in.`)
    await expect(page.getByLabel(/^Work email/)).toHaveValue(email)
  })

  await test.step('sign in and see an empty dashboard', async () => {
    await page.getByLabel(/^Password/).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'My dashboard' })).toBeVisible()
    await expect(page.getByText('Welcome back, Jordan.')).toBeVisible()
    await expect(page.getByRole('heading', { name: "You haven't reported any issues yet" })).toBeVisible()
  })

  await test.step('create a ticket, choosing Building -> Floor -> Seat', async () => {
    await page.getByRole('link', { name: 'Create New Ticket' }).click()
    await page.getByLabel(/^Title/).fill(title)
    await choose(page, 'Category', 'Electrical / Power')
    await page.getByLabel(/^Full description/).fill('Started this morning. Hard to read.')
    await page.getByRole('radio', { name: /^Just me/ }).check()
    await choose(page, 'Building', 'Building A')
    await choose(page, 'Floor', 'Floor 3')
    await choose(page, 'Seat', 'Seat 301')
    await page.getByRole('button', { name: 'Create ticket' }).click()

    await expect(page).toHaveURL(/\/tickets\/\d+$/)
    await expect(page.getByText('Ticket created.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title)
    await expect(page.locator('[aria-current="step"]')).toContainText('Open (current status)')
    await expect(page.getByText('Engineer: Not assigned yet')).toBeVisible()
    const details = page.getByRole('region', { name: 'Details' })
    await expect(details).toContainText('Building A')
    await expect(details).toContainText('Floor 3 · Seat 301')

    // The progress doubles as the history: each reached step says when it happened.
    const progress = page.getByRole('region', { name: 'Progress' })
    await expect(progress).toContainText('Received')
    await expect(progress.getByRole('listitem')).toHaveCount(5)
  })

  await test.step('add a note', async () => {
    const notes = page.getByRole('region', { name: 'Notes' })
    await expect(notes.getByText('No notes yet.')).toBeVisible()
    await notes.getByRole('textbox', { name: 'Add a note' }).fill('It is getting worse.')
    await notes.getByRole('button', { name: 'Send' }).click()

    await expect(notes.getByRole('listitem')).toHaveCount(1)
    await expect(notes.getByRole('listitem')).toContainText('You · Employee')
    await expect(notes.getByRole('listitem')).toContainText('It is getting worse.')
    await expect(notes.getByRole('textbox', { name: 'Add a note' })).toHaveValue('')
  })

  await test.step('request escalation', async () => {
    const escalation = page.getByRole('region', { name: 'Escalation' })
    await escalation.getByRole('button', { name: 'Escalate' }).click()
    await escalation.getByRole('textbox', { name: 'What changed?' }).fill('I cannot read my documents.')
    await escalation.getByRole('button', { name: 'Escalate ticket' }).click()

    await expect(escalation.getByRole('textbox')).toBeHidden()
    await expect(escalation).toContainText('Escalation requested')
    await expect(escalation).toContainText('I cannot read my documents.')
    await expect(page.getByText('Escalated', { exact: true })).toBeVisible()
  })

  await test.step('see it on the dashboard: counts, card, list and updates', async () => {
    await page.getByRole('link', { name: 'Back to dashboard' }).click()

    const counts = page.getByRole('list', { name: 'My tickets in numbers' }).getByRole('listitem')
    await expect(counts).toHaveText([
      'Active1not yet closed',
      'Open1not started yet',
      'In Progress0being fixed',
      'Blocked0waiting on something',
      'Resolved0fixed, pending close',
    ])

    // The most recent active ticket, with its progress and the note added above.
    const card = page.getByRole('region', { name: new RegExp(`^#\\d+ ${title}$`) })
    await expect(card.getByRole('list', { name: 'Ticket workflow' }).locator('[aria-current="step"]')).toHaveText(
      'Open (current status)',
    )
    await expect(card).toContainText('Waiting for an engineer')
    const note = card.getByRole('figure', { name: 'Latest note' })
    await expect(note).toContainText('You · Employee')
    await expect(note).toContainText('It is getting worse.')

    const table = page.getByRole('table', { name: 'My tickets' })
    await expect(table.getByRole('row')).toHaveCount(2)
    await expect(table).toContainText(title)
    await expect(table).toContainText('Building A · Floor 3 · Seat 301')
    await expect(table).toContainText('Just me')
    await expect(table).toContainText('Electrical / Power')

    await expect(page.getByRole('region', { name: 'Recent updates' })).toContainText(`${title} was received.`)
  })

  await test.step('add a note from the dashboard card', async () => {
    const card = page.getByRole('region', { name: new RegExp(`^#\\d+ ${title}$`) })
    await card.getByRole('button', { name: 'Add note' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add note' })
    await dialog.getByRole('textbox', { name: /Your note/ }).fill('Now it is off completely.')
    await dialog.getByRole('button', { name: 'Add note' }).click()

    await expect(dialog).toBeHidden()
    await expect(card.getByRole('figure', { name: 'Latest note' })).toContainText('Now it is off completely.')
  })

  await test.step('filter by a count and by search', async () => {
    const table = page.getByRole('table', { name: 'My tickets' })
    const counts = page.getByRole('list', { name: 'My tickets in numbers' })

    await counts.getByRole('button', { name: /^Blocked/ }).click()
    await expect(page.getByText('No tickets match these filters.')).toBeVisible()
    await page.getByRole('button', { name: 'Clear the Blocked filter' }).click()
    await expect(table.getByRole('row')).toHaveCount(2)

    await page.getByRole('searchbox', { name: 'Search' }).fill('no such ticket')
    await expect(page.getByText('No tickets match these filters.')).toBeVisible()
    await page.getByRole('searchbox', { name: 'Search' }).fill('lamp')
    await expect(table.getByRole('row')).toHaveCount(2)
  })

  await test.step('sign out, and protected pages need sign-in again', async () => {
    await page.getByRole('button', { name: 'Account' }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page.getByRole('alert')).toHaveText("You've signed out.")

    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('alert')).toHaveText('Please sign in to continue.')
  })

  await test.step('every tickets call sent a Bearer token, never X-User-Id', async () => {
    expect(authHeaders.length).toBeGreaterThan(5)
    for (const headers of authHeaders) {
      expect(headers.authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/)
      expect(headers).not.toHaveProperty('x-user-id')
    }
  })

  await test.step('no tickets response ever carried a priority', async () => {
    expect(ticketResponses.length).toBeGreaterThan(5)
    for (const body of ticketResponses) expect(body).not.toContain('priority')
    await expect(page.locator('body')).not.toContainText(/priority|\bP[123]\b/i)
  })
})
