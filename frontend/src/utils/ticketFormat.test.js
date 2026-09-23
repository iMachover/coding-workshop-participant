import { describe, expect, it } from 'vitest'

import { formatDateTime, formatLocation } from './ticketFormat'

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
