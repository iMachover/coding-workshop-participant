import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../test/renderWithProviders'
import TicketWorkflow from './TicketWorkflow'

const steps = () => within(screen.getByRole('list', { name: 'Ticket workflow' })).getAllByRole('listitem')
const current = () => steps().find((li) => li.getAttribute('aria-current') === 'step')

describe('TicketWorkflow', () => {
  it('lists the main path in order and marks the current step', () => {
    renderWithProviders(<TicketWorkflow status="in_progress" />)

    const names = steps().map((li) => li.firstChild.nextSibling.firstChild.textContent)
    expect(names).toEqual([
      'Open (done)',
      'In Progress (current status)',
      'Resolved (not reached yet)',
      'Closed (not reached yet)',
    ])
    expect(current()).toHaveTextContent('In Progress')
  })

  it('shows Blocked as a plain side state when the ticket is not blocked', () => {
    renderWithProviders(<TicketWorkflow status="resolved" blockedReason="old reason" />)
    const inProgress = steps()[1]
    expect(inProgress).toHaveTextContent(/^In Progress \(done\)Blocked$/)
    expect(screen.queryByText(/old reason/)).not.toBeInTheDocument()
    expect(current()).toHaveTextContent('Resolved')
  })

  it('shows a blocked ticket paused at In progress, with the reason', () => {
    renderWithProviders(<TicketWorkflow status="blocked" blockedReason="Waiting on a replacement part" />)
    expect(current()).toHaveTextContent('In Progress (paused while blocked)')
    // The Blocked branch hangs off the In Progress step, with the reason beside it.
    expect(current()).toHaveTextContent('Blocked: Waiting on a replacement part (current status)')
  })

  it('shows the Blocked branch with its reason on a phone too', () => {
    renderWithProviders(<TicketWorkflow status="blocked" blockedReason="No access badge" />, { width: 375 })
    expect(current()).toHaveTextContent('Blocked: No access badge (current status)')
  })

  it('copes with a blocked ticket that has no reason', () => {
    renderWithProviders(<TicketWorkflow status="blocked" />)
    expect(current()).toHaveTextContent(/Blocked \(current status\)$/)
  })

  it.each([
    ['desktop', 1280, 'row'],
    ['phone', 375, 'column'],
  ])('lays out as a %s', (_label, width, direction) => {
    renderWithProviders(<TicketWorkflow status="closed" />, { width })
    expect(screen.getByRole('list', { name: 'Ticket workflow' })).toHaveStyle({ flexDirection: direction })
    expect(current()).toHaveTextContent('Closed')
  })
})
