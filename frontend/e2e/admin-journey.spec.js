import { expect, test } from '@playwright/test'

import { sql } from './db.js'
import { choose, createTicketViaApi, registerViaApi, setRole, signIn, signInViaApi, uniqueEmail } from './helpers.js'

const ADMIN_HOME = 'Facility Admin dashboard'

/**
 * Three tickets from two employees, with a unique stamp in every title so other tests'
 * tickets in the shared e2e database can be filtered out by searching for it:
 *   lights   P1  building-wide  unassigned
 *   wifi     P3  one seat       unassigned, escalated, with the employee's note
 *   printer  P1  building-wide  assigned to an engineer, in progress
 */
async function seedTickets(request) {
  const stamp = Date.now()
  const dana = await registerViaApi(request, { name: 'Dana Requester', email: uniqueEmail('dana') })
  const lee = await registerViaApi(request, { name: 'Lee Requester', email: uniqueEmail('lee') })
  const engineer = await registerViaApi(request, { name: 'Sam Tech', email: uniqueEmail('engineer') })
  setRole(engineer.user_id, 'engineer')

  const [floorId, seatId] = sql(`SELECT f.floor_id || '|' || s.seat_id
    FROM seats s JOIN floors f USING (floor_id) JOIN buildings b USING (building_id)
    WHERE b.building_name = 'Building A' AND f.floor_number = 3 AND s.seat_number = '301'`)
    .split('|')
    .map(Number)

  const lights = await createTicketViaApi(request, dana, { title: `Lobby lights ${stamp}` })
  const wifi = await createTicketViaApi(request, lee, {
    title: `Wi-Fi drops ${stamp}`,
    category: 'network',
    affected_scope: 'me',
    floor_id: floorId,
    seat_id: seatId,
  })
  const printer = await createTicketViaApi(request, dana, { title: `Printer jam ${stamp}`, category: 'printer' })

  const leeHeaders = await signInViaApi(request, lee.email)
  expect((await request.post(`/api/core/tickets/${wifi.ticket_id}/notes`, {
    headers: leeHeaders, data: { note_text: 'Still dropping after a restart.' },
  })).status()).toBe(201)
  expect((await request.post(`/api/core/tickets/${wifi.ticket_id}/escalation`, {
    headers: leeHeaders, data: { reason: 'I have client calls all afternoon.' },
  })).status()).toBe(200)
  // Stand-in for an admin assigning it: no API assigns tickets yet.
  sql(`UPDATE tickets SET assigned_to_user_id = ${Number(engineer.user_id)}, status = 'in_progress',
       assigned_at = now() WHERE ticket_id = ${Number(printer.ticket_id)}`)

  return { stamp, lee, lights, wifi, printer }
}

async function registerAdmin(request) {
  const admin = await registerViaApi(request, { name: 'Ada Admin', email: uniqueEmail('admin') })
  setRole(admin.user_id, 'admin')
  return admin
}

/**
 * The Facility Admin's A1 path, through the UI: sign in -> see the unassigned queue ->
 * search and filter all tickets -> open an escalated ticket's details -> back.
 */
test('an admin triages every ticket from their dashboard', async ({ page, request }) => {
  const { stamp, lee, lights, wifi, printer } = await seedTickets(request)
  const admin = await registerAdmin(request)

  // The admin page must never fall back to the employee-only tickets API.
  const employeeApiCalls = []
  page.on('request', (req) => {
    if (req.url().includes('/api/core/tickets')) employeeApiCalls.push(req.url())
  })

  await test.step('sign in and land on the admin dashboard', async () => {
    await signIn(page, admin.email, { home: ADMIN_HOME })
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('banner')).toContainText('Facility Admin')
  })

  const queue = page.getByRole('region', { name: /Needs an engineer/ })

  await test.step('the unassigned queue shows new tickets with their priority', async () => {
    const lightsCard = queue.getByRole('listitem').filter({ hasText: lights.title })
    await expect(lightsCard.getByLabel('Priority P1: Building-wide')).toBeVisible()
    await expect(lightsCard).toContainText('Dana Requester · waiting')

    const wifiCard = queue.getByRole('listitem').filter({ hasText: wifi.title })
    await expect(wifiCard.getByLabel('Priority P3: One person')).toBeVisible()
    await expect(wifiCard.getByText('Escalated')).toBeVisible()

    // Assigned tickets don't need an engineer.
    await expect(queue.getByText(printer.title)).toHaveCount(0)
  })

  const table = page.getByRole('table', { name: 'All tickets' })
  const titles = () => table.getByRole('row').getByRole('link')

  await test.step('search all tickets, then narrow with filters', async () => {
    await page.getByRole('searchbox', { name: 'Search' }).fill(String(stamp))
    // Triage order: the two P1s oldest first, then the P3.
    await expect(titles()).toHaveText([lights.title, printer.title, wifi.title])
    const printerRow = table.getByRole('row').filter({ hasText: printer.title })
    await expect(printerRow).toContainText('Sam Tech')
    await expect(printerRow).toContainText('In Progress')

    await choose(page, 'Assignment', 'Unassigned')
    await expect(titles()).toHaveText([lights.title, wifi.title])

    await page.getByRole('switch', { name: 'Escalated only' }).check()
    await expect(titles()).toHaveText([wifi.title])

    await page.getByRole('switch', { name: 'Escalated only' }).uncheck()
    await choose(page, 'Assignment', 'Assigned or not')
    await choose(page, 'Priority', 'P1 · Building-wide')
    await expect(titles()).toHaveText([lights.title, printer.title])
  })

  await test.step('search by the requester\'s email', async () => {
    await choose(page, 'Priority', 'All priorities')
    await page.getByRole('searchbox', { name: 'Search' }).fill(lee.email)
    await expect(titles()).toHaveText([wifi.title])
  })

  await test.step('open the escalated ticket: priority, requester, reason and notes', async () => {
    await titles().first().click()
    await expect(page).toHaveURL(new RegExp(`/admin/tickets/${wifi.ticket_id}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`#${wifi.ticket_id} ${wifi.title}`)
    await expect(page.getByLabel('Priority P3: One person')).toBeVisible()

    const escalation = page.getByRole('alert')
    await expect(escalation).toContainText('Lee Requester asked for an admin to review this ticket')
    await expect(escalation).toContainText('I have client calls all afternoon.')

    const requester = page.getByRole('region', { name: 'Requester' })
    await expect(requester.getByRole('link', { name: lee.email })).toHaveAttribute('href', `mailto:${lee.email}`)

    const notes = page.getByRole('region', { name: 'Notes' })
    await expect(notes).toContainText('Still dropping after a restart.')
    await expect(notes.getByRole('textbox')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Status history' })).toContainText('Lee Requester')
  })

  await test.step('go back to the dashboard', async () => {
    await page.getByRole('link', { name: 'Back to admin dashboard' }).click()
    await expect(page.getByRole('heading', { level: 1, name: ADMIN_HOME })).toBeVisible()
  })

  expect(employeeApiCalls).toEqual([])
})

test('employees cannot open the admin pages', async ({ page, request }) => {
  const { lights } = await seedTickets(request)
  const employee = await registerViaApi(request, { name: 'Curious Employee' })

  await signIn(page, employee.email)
  for (const path of ['/admin', `/admin/tickets/${lights.ticket_id}`]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: "You don't have access to this" })).toBeVisible()
    await expect(page.getByText(lights.title)).toHaveCount(0)
  }
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  test('the admin dashboard and ticket details fit the screen', async ({ page, request }) => {
    const { stamp, lights } = await seedTickets(request)
    const admin = await registerAdmin(request)

    await signIn(page, admin.email, { home: ADMIN_HOME })
    await page.getByRole('searchbox', { name: 'Search' }).fill(String(stamp))
    await expect(page.getByRole('table')).toHaveCount(0)
    // On phones the list is cards; each card is one link to the ticket.
    const card = page
      .getByRole('region', { name: 'All tickets' })
      .getByRole('link')
      .filter({ hasText: `#${lights.ticket_id} ${lights.title}` })
    await expect(card).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)

    await card.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`#${lights.ticket_id} ${lights.title}`)
    await expect(page.getByRole('list', { name: 'Ticket workflow' })).toHaveCSS('flex-direction', 'column')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  })
})
