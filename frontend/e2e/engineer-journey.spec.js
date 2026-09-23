import { expect, test } from '@playwright/test'

import { sql } from './db.js'
import { createTicketViaApi, registerAdmin, registerEngineer, registerViaApi, signIn, signInViaApi } from './helpers.js'

const HOME = 'My queue'

/**
 * An engineer with three tickets from an employee, plus a ticket given to someone else.
 * Every title carries a stamp, so the shared e2e database's other tickets can be searched
 * away. Assignments go through the admin API, like in the app.
 *   lights   P1  building-wide  open
 *   heater   P1  building-wide  open (newer, so it comes after lights)
 *   printer  P2  one floor      open
 *   others   P3                 assigned to a different engineer
 */
async function seedQueue(request) {
  const stamp = Date.now()
  const employee = await registerViaApi(request, { name: 'Dana Requester' })
  const engineer = await registerEngineer(request, `Sam Tech ${stamp}`)
  const other = await registerEngineer(request, `Kim Fixit ${stamp}`)
  const adminHeaders = await signInViaApi(request, (await registerAdmin(request)).email)

  const floor = sql(`SELECT f.floor_id FROM floors f JOIN buildings b USING (building_id)
    WHERE b.building_name = 'Building A' AND f.floor_number = 2`)
  const lights = await createTicketViaApi(request, employee, { title: `Lobby lights ${stamp}` })
  const heater = await createTicketViaApi(request, employee, { title: `Heater rattles ${stamp}` })
  const printer = await createTicketViaApi(request, employee, {
    title: `Printer jam ${stamp}`,
    category: 'printer',
    affected_scope: 'floor',
    floor_id: Number(floor),
  })
  const others = await createTicketViaApi(request, employee, { title: `Someone else's ${stamp}` })

  const assign = async (ticket, engineerId) => {
    const response = await request.put(`/api/core/admin/tickets/${ticket.ticket_id}/assignment`, {
      headers: adminHeaders,
      data: { engineer_id: engineerId },
    })
    expect(response.status()).toBe(200)
  }
  for (const ticket of [lights, heater, printer]) await assign(ticket, engineer.user_id)
  await assign(others, other.user_id)

  return { stamp, employee, engineer, lights, heater, printer, others }
}

/**
 * E1 through the UI: sign in -> the queue's "Up next", counts and list -> search and
 * filter -> open a ticket, read it, add a note the employee sees -> someone else's ticket
 * looks missing.
 */
test('an engineer works through their queue', async ({ page, request }) => {
  const { stamp, employee, engineer, lights, heater, printer, others } = await seedQueue(request)

  await test.step('sign in and land on My queue', async () => {
    await signIn(page, engineer.email, { home: HOME })
    await expect(page).toHaveURL(/\/engineer$/)
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name: 'My queue' })).toHaveAttribute('aria-current', 'page')
  })

  await test.step('nothing is in progress, so the top P1 is up next', async () => {
    const card = page.getByRole('region', { name: 'Up next' })
    await expect(card).toContainText(`#${lights.ticket_id} ${lights.title}`)
    await expect(card.getByLabel('Priority P1: Building-wide')).toBeVisible()
    const tiles = page.getByRole('list', { name: 'My queue in numbers' }).getByRole('listitem')
    await expect(tiles).toHaveText(['Open3', 'In Progress0', 'Blocked0', 'P1 to finish2'])
  })

  const table = page.getByRole('table', { name: 'My tickets' })
  const titles = () => table.getByRole('row').getByRole('link')

  await test.step('the list is theirs, in triage order, and filters', async () => {
    await page.getByRole('searchbox', { name: 'Search' }).fill(String(stamp))
    await expect(titles()).toHaveText([lights.title, heater.title, printer.title])
    await expect(table.getByText(others.title)).toHaveCount(0)

    await page.getByRole('combobox', { name: /^Priority/ }).click()
    await page.getByRole('option', { name: 'P2 · A whole floor' }).click()
    await expect(titles()).toHaveText([printer.title])
  })

  await test.step('once one is in progress, it becomes the current ticket', async () => {
    // Stand-in for E2's "Start work": no API changes status yet.
    sql(`UPDATE tickets SET status = 'in_progress', updated_at = now() WHERE ticket_id = ${Number(heater.ticket_id)}`)
    await page.reload()
    const card = page.getByRole('region', { name: 'Current ticket' })
    await expect(card).toContainText(`#${heater.ticket_id} ${heater.title}`)
    await card.getByRole('link', { name: 'Open ticket' }).click()
  })

  await test.step('the ticket shows priority and how to reach the requester', async () => {
    await expect(page).toHaveURL(new RegExp(`/engineer/tickets/${heater.ticket_id}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`#${heater.ticket_id} ${heater.title}`)
    await expect(page.getByLabel('Priority P1: Building-wide')).toBeVisible()
    const requester = page.getByRole('region', { name: 'Requester' })
    await expect(requester.getByRole('link', { name: employee.email })).toHaveAttribute('href', `mailto:${employee.email}`)
    await expect(page.getByRole('region', { name: 'Status history' })).toContainText('Dana Requester')
  })

  await test.step('add a note, which the employee sees', async () => {
    const notes = page.getByRole('region', { name: 'Notes' })
    await notes.getByRole('textbox', { name: 'Add a note' }).fill('Bleeding the radiator this afternoon.')
    await notes.getByRole('button', { name: 'Add note' }).click()
    await expect(notes.getByRole('listitem').filter({ hasText: 'Bleeding the radiator' })).toContainText('You · Engineer')
    await expect(notes.getByRole('textbox', { name: 'Add a note' })).toHaveValue('')

    const response = await request.get(`/api/core/tickets/${heater.ticket_id}/notes`, {
      headers: await signInViaApi(request, employee.email),
    })
    const [note] = await response.json()
    expect([note.author_name, note.author_role, note.note_text]).toEqual([
      engineer.full_name,
      'engineer',
      'Bleeding the radiator this afternoon.',
    ])
  })

  await test.step('someone else\'s ticket looks missing', async () => {
    await page.goto(`/engineer/tickets/${others.ticket_id}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Ticket not found' })).toBeVisible()
    await expect(page.getByText(others.title)).toHaveCount(0)
    await page.getByRole('link', { name: 'Go to my queue' }).click()
    await expect(page.getByRole('heading', { level: 1, name: HOME })).toBeVisible()
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  test('the queue and a ticket fit the screen', async ({ page, request }) => {
    const { stamp, engineer, printer } = await seedQueue(request)

    await signIn(page, engineer.email, { home: HOME })
    await page.getByRole('searchbox', { name: 'Search' }).fill(String(stamp))
    await expect(page.getByRole('table')).toHaveCount(0)
    const card = page
      .getByRole('region', { name: 'My tickets' })
      .getByRole('link')
      .filter({ hasText: `#${printer.ticket_id} ${printer.title}` })
    await expect(card).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)

    await card.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`#${printer.ticket_id} ${printer.title}`)
    await expect(page.getByRole('list', { name: 'Ticket workflow' })).toHaveCSS('flex-direction', 'column')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  })
})
