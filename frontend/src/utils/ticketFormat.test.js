import { describe, expect, it } from 'vitest'

import { formatAge, formatDateTime, formatLocation } from './ticketFormat'

describe('formatLocation', () => {
  it.each([
    [{ building_name: 'Building A', floor_number: 3, seat_number: '301' }, 'Building A · Floor 3 · Seat 301'],
    [{ building_name: 'Building A', floor_number: 2, seat_number: null }, 'Building A · Floor 2'],
    [{ building_name: 'Building B', floor_number: null, seat_number: null }, 'Building B'],
    [{ building_name: 'Building A', floor_number: 0, seat_number: null }, 'Building A · Floor 0'],
  ])('%o -> %s', (ticket, expected) => {
    expect(formatLocation(ticket)).toBe(expected)
  })
})

describe('formatDateTime', () => {
  it('shows a short date and time', () => {
    expect(formatDateTime('2026-09-22T20:35:00Z')).toMatch(/^Sep \d{1,2}, \d{1,2}:\d{2} (AM|PM)$/)
  })
})

describe('formatAge', () => {
  const now = Date.parse('2026-09-23T12:00:00Z')

  it.each([
    ['2026-09-23T12:00:00Z', 'just now'],
    ['2026-09-23T11:59:30Z', 'just now'],
    ['2026-09-23T11:59:00Z', '1 min'],
    ['2026-09-23T11:01:00Z', '59 min'],
    ['2026-09-23T11:00:00Z', '1 h'],
    ['2026-09-22T12:01:00Z', '23 h'],
    ['2026-09-22T12:00:00Z', '1 d'],
    ['2026-09-13T12:00:00Z', '10 d'],
  ])('%s -> %s', (iso, expected) => {
    expect(formatAge(iso, now)).toBe(expected)
  })
})
