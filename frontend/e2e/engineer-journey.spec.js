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
 * E1 and E2 through the UI: sign in -> the queue's "Up next", counts and list -> search and
 * filter -> start the up-next ticket -> read it, add a note -> block, unblock and resolve
 * it, which the employee sees on their own page -> someone else's ticket looks missing.
 */
test('an engineer works through their queue', async ({ page, browser, request }) => {
  const { stamp, employee, engineer, lights, heater, printer, others } = await seedQueue(request)

  await test.step('sign in and land on My queue', async () => {
    await signIn(page, engineer.email, { home: HOME })
    await expect(page).toHaveURL(/\/engineer$/)
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name: 'My queue' })).toHaveAttribute('aria-current', 'page')
  })

  const tiles = page.getByRole('list', { name: 'My queue in numbers' }).getByRole('listitem')
  const upNext = page.getByRole('region', { name: 'Up next' })

  await test.step('nothing is in progress, so the P1s are up next, oldest first', async () => {
    await expect(page.getByRole('region', { name: 'Working on now' })).toContainText('Nothing in progress.')
    const items = upNext.getByRole('listitem')
    await expect(items).toHaveCount(3)
    await expect(items.nth(0)).toContainText(`#${lights.ticket_id}${lights.title}`)
    await expect(items.nth(0).getByLabel('Priority P1: Building-wide')).toBeVisible()
    await expect(items.nth(1)).toContainText(heater.title)
    await expect(items.nth(2)).toContainText(printer.title)
    await expect(tiles).toHaveText([
      'To start3assigned, not started',
      'In Progress0on the go',
      'Blocked0waiting',
      'P1 active2critical',
      'Resolved0awaiting admin close',
    ])
  })

  const table = page.getByRole('table', { name: 'My tickets' })
  const ids = (...tickets) => tickets.map((t) => `#${t.ticket_id}`)

  await test.step('the list is theirs, in triage order, and filters', async () => {
    await page.getByRole('searchbox', { name: 'Search' }).fill(String(stamp))
    await expect(table.getByRole('link')).toHaveText(ids(lights, heater, printer))
    await expect(table.getByText(others.title)).toHaveCount(0)

    await page.getByRole('combobox', { name: /^Priority/ }).click()
    await page.getByRole('option', { name: 'P2 · A whole floor' }).click()
    await expect(table.getByRole('link')).toHaveText(ids(printer))
  })

  await test.step('start the up-next ticket, which becomes the one being worked on', async () => {
    await upNext.getByRole('button', { name: `Start work on #${lights.ticket_id}` }).click()
    await expect(page.getByRole('alert')).toHaveText(`Started #${lights.ticket_id}.`)
    const card = page.getByRole('region', { name: 'WORKING ON NOW' })
    await expect(card).toContainText(`#${lights.ticket_id}`)
    await expect(tiles).toHaveText([
      'To start2assigned, not started',
      'In Progress1on the go',
      'Blocked0waiting',
      'P1 active2critical',
      'Resolved0awaiting admin close',
    ])
    await expect(upNext.getByRole('listitem')).toHaveCount(2)
    await card.getByRole('link', { name: lights.title }).click()
  })

  await test.step('the ticket shows priority and how to reach the requester', async () => {
    await expect(page).toHaveURL(new RegExp(`/engineer/tickets/${lights.ticket_id}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`#${lights.ticket_id} ${lights.title}`)
    await expect(page.getByLabel('Priority P1: Building-wide')).toBeVisible()
    const requester = page.getByRole('region', { name: 'Requester' })
    await expect(requester).toContainText(employee.email)
    await expect(requester.getByRole('link', { name: 'Email' })).toHaveAttribute('href', `mailto:${employee.email}`)
    await expect(page.getByRole('region', { name: 'Status history' })).toContainText('Dana Requester')
    // Fits one screen: only the panels scroll, never the page.
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true)
  })

  await test.step('add a note, which the employee sees', async () => {
    const notes = page.getByRole('region', { name: 'Notes' })
    await notes.getByRole('textbox', { name: 'Add a note' }).fill('Bleeding the radiator this afternoon.')
    await notes.getByRole('button', { name: 'Send' }).click()
    await expect(notes.getByRole('listitem').filter({ hasText: 'Bleeding the radiator' })).toContainText('You · just now')
    await expect(notes.getByRole('textbox', { name: 'Add a note' })).toHaveValue('')

    const response = await request.get(`/api/core/tickets/${lights.ticket_id}/notes`, {
      headers: await signInViaApi(request, employee.email),
    })
    const [note] = await response.json()
    expect([note.author_name, note.author_role, note.note_text]).toEqual([
      engineer.full_name,
      'engineer',
      'Bleeding the radiator this afternoon.',
    ])
  })

  const controls = page.getByRole('region', { name: 'Change status' })
  const workflow = page.getByRole('list', { name: 'Ticket workflow' })

  await test.step('block it with a reason, then resume work', async () => {
    await controls.getByRole('button', { name: 'Mark blocked' }).click()
    // Asked inline, in the header, not in a dialog.
    await controls.getByRole('textbox', { name: 'Why is the work paused?' }).fill('Waiting on a replacement ballast')
    await controls.getByRole('button', { name: 'Mark blocked' }).click()

    await expect(page.getByRole('alert').filter({ hasText: 'Status changed to Blocked.' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Progress' })).toContainText('Blocked: Waiting on a replacement ballast')
    await controls.getByRole('button', { name: 'Resume work' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Status changed to In Progress.' })).toBeVisible()
    await expect(workflow).toContainText('In Progress (current status)')
    await expect(page.getByRole('region', { name: 'Progress' })).not.toContainText('Blocked: Waiting')
  })

  await test.step('resolve it with a summary of what was done', async () => {
    await controls.getByRole('button', { name: 'Mark resolved' }).click()
    await controls.getByRole('textbox', { name: 'What did you do?' }).fill('Replaced the ballast; all lobby lights on')
    await controls.getByRole('textbox', { name: 'What did you do?' }).press('Enter')

    await expect(controls).toContainText('Waiting for the admin to close it')
    await expect(workflow).toContainText('Resolved (current status)')
    await expect(controls.getByRole('button', { name: 'Reopen' })).toBeVisible()
    await expect(controls.getByRole('button', { name: 'Mark resolved' })).toHaveCount(0)
    const history = page.getByRole('region', { name: 'Status history' })
    await expect(history).toContainText('Replaced the ballast; all lobby lights on')
    await expect(history).toContainText('Waiting on a replacement ballast')
  })

  await test.step('the employee sees it resolved, with the engineer\'s summary', async () => {
    const employeePage = await (await browser.newContext()).newPage()
    await signIn(employeePage, employee.email)
    await employeePage.goto(`/tickets/${lights.ticket_id}`)
    // The Resolved step names the engineer and quotes their summary.
    const resolved = employeePage.locator('[aria-current="step"]')
    await expect(resolved).toContainText('Resolved (current status)')
    await expect(resolved).toContainText(`${engineer.full_name} resolved it`)
    await expect(resolved).toContainText('Replaced the ballast; all lobby lights on')
    await expect(employeePage.getByRole('region', { name: 'Progress' })).toContainText('Was blocked')
    await expect(employeePage.locator('body')).not.toContainText(/\bP[123]\b/)
    await employeePage.context().close()
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
    // On phones the search and filters sit behind a Filter button.
    await page.getByRole('button', { name: 'Filter' }).click()
    await page.getByRole('searchbox', { name: 'Search' }).fill(String(stamp))
    await expect(page.getByRole('table')).toHaveCount(0)
    const card = page
      .getByRole('region', { name: 'All my tickets' })
      .getByRole('link')
      .filter({ hasText: printer.title })
    await expect(card).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)

    await card.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`#${printer.ticket_id} ${printer.title}`)
    await expect(page.getByText('Step 1 of 4 · Open')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true')
    // The status button is pinned to the bottom of the screen.
    const start = page.getByRole('region', { name: 'Change status' }).getByRole('button', { name: 'Start work' })
    await expect(start).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  })
})
