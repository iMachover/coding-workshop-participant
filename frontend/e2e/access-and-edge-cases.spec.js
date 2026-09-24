import { expect, test } from '@playwright/test'

import { sql } from './db.js'
import { createTicketViaApi, PASSWORD, registerViaApi, setRole, signIn, uniqueEmail } from './helpers.js'

test('an employee cannot open another employee\'s ticket', async ({ page, request }) => {
  const owner = await registerViaApi(request, { name: 'Ticket Owner' })
  const ticket = await createTicketViaApi(request, owner)
  const other = await registerViaApi(request, { name: 'Someone Else' })

  await signIn(page, other.email)
  await page.goto(`/tickets/${ticket.ticket_id}`)

  await expect(page.getByRole('heading', { level: 1, name: 'Ticket not found' })).toBeVisible()
  await expect(page.getByText(ticket.title)).toHaveCount(0)
})

test('a blocked ticket shows the engineer\'s reason next to Blocked', async ({ page, request }) => {
  const owner = await registerViaApi(request, { name: 'Blocked Owner' })
  const ticket = await createTicketViaApi(request, owner)
  // Stand-in for an engineer: the employee API can't block tickets.
  sql(
    `UPDATE tickets SET status = 'blocked', blocked_reason = 'Waiting for a replacement part'
     WHERE ticket_id = ${Number(ticket.ticket_id)}`,
  )

  await signIn(page, owner.email)
  // The dashboard's most-recent card says so too, with the same reason.
  const card = page.getByRole('region', { name: `#${ticket.ticket_id} ${ticket.title}` })
  await expect(card.locator('[aria-current="step"]')).toHaveText('In Progress (paused while blocked)')
  await expect(card).toContainText('Blocked: Waiting for a replacement part')

  // The details page gives Blocked its own step, current, with the reason right under it.
  await page.goto(`/tickets/${ticket.ticket_id}`)
  const steps = page.getByRole('list', { name: 'Ticket workflow' }).getByRole('listitem')
  await expect(steps.nth(1)).toContainText('In Progress (paused while blocked)')
  const current = page.locator('[aria-current="step"]')
  await expect(current).toContainText('Blocked (current status)')
  await expect(current).toContainText('Waiting for a replacement part')
})

test('a reopened ticket says so, and why, on its progress', async ({ page, request }) => {
  const owner = await registerViaApi(request, { name: 'Reopen Owner' })
  const ticket = await createTicketViaApi(request, owner)
  const engineer = await registerViaApi(request, { name: 'Sam Tech', email: uniqueEmail('engineer') })
  const ticketId = Number(ticket.ticket_id)
  const engineerId = Number(engineer.user_id)
  // Stand-in for an engineer working the ticket: no API changes status yet.
  setRole(engineerId, 'engineer')
  sql(`INSERT INTO ticket_status_history (ticket_id, from_status, to_status, changed_by_user_id, reason) VALUES
       (${ticketId}, 'open', 'in_progress', ${engineerId}, NULL),
       (${ticketId}, 'in_progress', 'resolved', ${engineerId}, NULL),
       (${ticketId}, 'resolved', 'open', ${engineerId}, 'Door stuck again this morning')`)
  sql(`UPDATE tickets SET status = 'open' WHERE ticket_id = ${ticketId}`)

  await signIn(page, owner.email)
  await page.goto(`/tickets/${ticketId}`)

  // Back at Open, so the later steps are "not reached yet" again.
  const current = page.locator('[aria-current="step"]')
  await expect(current).toContainText('Open (current status)')
  await expect(current).toContainText('Reopened')
  await expect(current).toContainText('Door stuck again this morning')
  const steps = page.getByRole('list', { name: 'Ticket workflow' }).getByRole('listitem')
  await expect(steps.nth(1)).toContainText('In Progress (not reached yet)')
  await expect(steps.nth(3)).toContainText('Resolved (not reached yet)')
})

test('forms explain problems before and after reaching the API', async ({ page, request }) => {
  await page.goto('/register')
  await page.getByLabel(/^Work email/).fill('someone@gmail.com')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Use your @acme.inc email address.')).toBeVisible()

  const existing = await registerViaApi(request, { name: 'Already Here' })
  await page.goto('/login')
  await page.getByLabel(/^Work email/).fill(existing.email)
  await page.getByLabel(/^Password/).fill('not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
})

test('a forged or stale token is signed out with an explanation', async ({ page }) => {
  await page.goto('/login')
  // Token-shaped, but not signed by the server: the API must reject it with 401.
  const forged = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxIiwicm9sZSI6ImFkbWluIn0', 'bm90LWEtcmVhbC1zaWduYXR1cmU']
  await page.evaluate((token) =>
    localStorage.setItem('helpdesk.session', JSON.stringify({ token, user: { user_id: 1, full_name: 'Ghost', role: 'employee' } })),
  forged.join('.'))

  await page.goto('/dashboard')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('alert')).toHaveText('Your session has ended. Please sign in again.')
})

test('an engineer lands on their own queue and never calls the employee API', async ({ page, request }) => {
  const engineer = await registerViaApi(request, { name: 'Sam Tech', email: uniqueEmail('engineer') })
  setRole(engineer.user_id, 'engineer')
  const ticketCalls = []
  page.on('response', (response) => {
    if (response.url().includes('/api/core/tickets')) ticketCalls.push(response.status())
  })

  await page.goto('/login')
  await page.getByLabel(/^Work email/).fill(engineer.email)
  await page.getByLabel(/^Password/).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/engineer$/)
  await expect(page.getByRole('heading', { level: 1, name: 'My queue' })).toBeVisible()
  await expect(page.getByRole('banner')).toContainText('Engineer')

  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { level: 1, name: "You don't have access to this" })).toBeVisible()
  await page.getByRole('link', { name: 'Go to my start page' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'My queue' })).toBeVisible()

  expect(ticketCalls).toEqual([])
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  test('the dashboard and ticket details fit the screen', async ({ page, request }) => {
    const owner = await registerViaApi(request, { name: 'Phone User', email: uniqueEmail('phone') })
    const ticket = await createTicketViaApi(request, owner)

    await signIn(page, owner.email)
    await expect(page.getByRole('link', { name: /ACME Facilities/ })).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
    // On phones the list is cards; each card is one link to the ticket.
    const card = page.getByRole('region', { name: 'My tickets' }).getByRole('link').filter({ hasText: ticket.title })
    await expect(card).toHaveAttribute('href', `/tickets/${ticket.ticket_id}`)
    await expect(card).toBeVisible()
    // The Create button stays on screen, pinned to the bottom.
    const create = page.getByRole('link', { name: 'Create New Ticket' })
    await expect(create).toBeInViewport()
    const box = await create.boundingBox()
    expect(box.y + box.height).toBeGreaterThan(812 - 24)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)

    // The ticket opens on its Notes tab, with the note box pinned to the bottom.
    await card.click()
    await expect(page.getByRole('tab', { name: /^Notes/ })).toHaveAttribute('aria-selected', 'true')
    const noteBox = page.getByRole('textbox', { name: 'Add a note' })
    await expect(noteBox).toBeInViewport()
    const noteBoxBox = await noteBox.boundingBox()
    expect(noteBoxBox.y + noteBoxBox.height).toBeGreaterThan(812 - 32)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
    await page.getByRole('tab', { name: 'Progress' }).click()
    await expect(page.getByRole('list', { name: 'Ticket workflow' }).getByRole('listitem')).toHaveCount(5)
  })
})
