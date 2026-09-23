import { describe, expect, it } from 'vitest'

import {
  activeTicketsText,
  buildingFilterOptions,
  facilityName,
  facilityValue,
  hiddenByParent,
  parseFacilityValue,
} from './facilities'

const BUILDING = { building_id: 1, building_name: 'Building A', is_active: true }
const FLOOR = { floor_id: 3, floor_number: -1, is_active: true }
const SEAT = { seat_id: 8, seat_number: '12A', is_active: true }

describe('facilityName and facilityValue', () => {
  it('names each level the way the dropdowns and API messages do', () => {
    expect(facilityName('building', BUILDING)).toBe('Building A')
    expect(facilityName('floor', FLOOR)).toBe('Floor -1')
    expect(facilityName('seat', SEAT)).toBe('Seat 12A')
  })

  it('gives the current name or number as text for the rename form', () => {
    expect(facilityValue('building', BUILDING)).toBe('Building A')
    expect(facilityValue('floor', FLOOR)).toBe('-1')
    expect(facilityValue('seat', SEAT)).toBe('12A')
  })
})

describe('parseFacilityValue', () => {
  it.each([
    ['building', '  Annex ', 'Annex'],
    ['building', 'x'.repeat(100), 'x'.repeat(100)],
    ['floor', '3', 3],
    ['floor', ' -10 ', -10],
    ['floor', '200', 200],
    ['seat', ' b-12 ', 'b-12'],
  ])('accepts %s %j', (kind, text, value) => {
    expect(parseFacilityValue(kind, text)).toEqual({ value, problem: '' })
  })

  it.each([
    ['building', '   ', 'Enter a building name.'],
    ['building', 'x'.repeat(101), 'Use 100 characters or fewer.'],
    ['floor', '', 'Enter a whole number, like 3 or -1.'],
    ['floor', '2.5', 'Enter a whole number, like 3 or -1.'],
    ['floor', 'first', 'Enter a whole number, like 3 or -1.'],
    ['floor', '-11', 'Use a floor from -10 to 200.'],
    ['floor', '201', 'Use a floor from -10 to 200.'],
    ['seat', '', 'Enter a seat number.'],
    ['seat', 'x'.repeat(21), 'Use 20 characters or fewer.'],
  ])('refuses %s %j', (kind, text, problem) => {
    expect(parseFacilityValue(kind, text)).toEqual({ value: null, problem })
  })
})

describe('activeTicketsText', () => {
  it.each([
    [0, '0 active tickets'],
    [1, '1 active ticket'],
    [3, '3 active tickets'],
  ])('%i', (count, text) => {
    expect(activeTicketsText(count)).toBe(text)
  })
})

describe('hiddenByParent', () => {
  it('explains an item hidden by an inactive building or floor', () => {
    expect(hiddenByParent(BUILDING)).toBe('')
    expect(hiddenByParent(BUILDING, FLOOR)).toBe('')
    expect(hiddenByParent({ ...BUILDING, is_active: false }, FLOOR)).toBe('Hidden while Building A is inactive.')
    expect(hiddenByParent(BUILDING, { ...FLOOR, is_active: false })).toBe('Hidden while Floor -1 is inactive.')
  })
})

describe('buildingFilterOptions', () => {
  it('keeps inactive buildings, marked', () => {
    expect(
      buildingFilterOptions([BUILDING, { building_id: 2, building_name: 'Building B', is_active: false }]),
    ).toEqual([
      ['1', 'Building A'],
      ['2', 'Building B (inactive)'],
    ])
  })
})
