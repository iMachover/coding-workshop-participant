import { expect } from '@playwright/test'

export const PASSWORD = 'e2e-password-123'

/** A unique @acme.inc email, so tests never collide within a run. */
export function uniqueEmail(name) {
  return `${name}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@acme.inc`
}

/** Register through the API (via the app's own /api proxy) and return the user. */
export async function registerViaApi(request, { name = 'E2E Employee', email = uniqueEmail('e2e') } = {}) {
  const response = await request.post('/api/core/auth/register', {
    data: { email, full_name: name, password: PASSWORD },
  })
  expect(response.status()).toBe(201)
  return response.json()
}

/** Create a building-wide ticket in Building A through the API, as the given user. */
export async function createTicketViaApi(request, user, overrides = {}) {
  const buildings = await (await request.get('/api/core/buildings', { headers: { 'X-User-Id': String(user.user_id) } })).json()
  const response = await request.post('/api/core/tickets', {
    headers: { 'X-User-Id': String(user.user_id) },
    data: {
      title: 'Lobby door sticks',
      short_description: 'Hard to open',
      description: 'The main lobby door needs a hard push.',
      category: 'building_facilities',
      urgency: 'medium',
      affected_scope: 'building',
      building_id: buildings.find((b) => b.building_name === 'Building A').building_id,
      ...overrides,
    },
  })
  expect(response.status()).toBe(201)
  return response.json()
}

/** Sign in through the real form and wait for the dashboard. */
export async function signIn(page, email, password = PASSWORD) {
  await page.goto('/login')
  await page.getByLabel(/^Work email/).fill(email)
  await page.getByLabel(/^Password/).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'My dashboard' })).toBeVisible()
}

/** Pick an option from an MUI select by its label. */
export async function choose(page, label, option) {
  await page.getByRole('combobox', { name: new RegExp(`^${label}`) }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}
