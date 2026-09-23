import { describe, expect, it } from 'vitest'

import { homePathFor, roleLabel } from './roles'

describe('homePathFor', () => {
  it.each([
    ['employee', '/dashboard'],
    ['engineer', '/engineer'],
    ['admin', '/admin'],
    ['someday-role', '/dashboard'],
  ])('%s starts at %s', (role, path) => {
    expect(homePathFor(role)).toBe(path)
  })
})

describe('roleLabel', () => {
  it.each([
    ['employee', 'Employee'],
    ['engineer', 'Engineer'],
    ['admin', 'Facility Admin'],
    ['someday-role', 'someday-role'],
  ])('%s reads as "%s"', (role, label) => {
    expect(roleLabel(role)).toBe(label)
  })
})
