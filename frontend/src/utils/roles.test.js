import { describe, expect, it } from 'vitest'

import { homePathFor, navLinksFor, roleLabel } from './roles'

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

describe('navLinksFor', () => {
  const current = (role, path) => navLinksFor(role, path).filter((l) => l.current).map((l) => l.label)

  it('gives admins Dashboard and People', () => {
    expect(navLinksFor('admin', '/admin').map(({ to, label }) => [to, label])).toEqual([
      ['/admin', 'Dashboard'],
      ['/admin/people', 'People'],
    ])
  })

  it.each([
    ['/admin', ['Dashboard']],
    ['/admin/tickets/5', ['Dashboard']],
    ['/admin/people', ['People']],
    ['/admin/peoplex', ['Dashboard']],
    ['/dashboard', []],
  ])('marks the right link current at %s', (path, expected) => {
    expect(current('admin', path)).toEqual(expected)
  })

  it.each(['employee', 'engineer', 'someday-role'])('gives %s no links', (role) => {
    expect(navLinksFor(role, '/')).toEqual([])
  })
})
