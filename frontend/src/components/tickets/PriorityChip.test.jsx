import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../test/renderWithProviders'
import PriorityChip from './PriorityChip'

describe('PriorityChip', () => {
  it.each([
    ['P1', 'Priority P1: Building-wide', 'MuiChip-filled'],
    ['P2', 'Priority P2: A whole floor', 'MuiChip-outlined'],
    ['P3', 'Priority P3: One person', 'MuiChip-outlined'],
  ])('%s reads "%s"', (priority, meaning, variantClass) => {
    renderWithProviders(<PriorityChip priority={priority} />)
    const chip = screen.getByLabelText(meaning)
    expect(chip).toHaveTextContent(priority)
    expect(chip).toHaveClass(variantClass)
  })

  it('explains itself on hover', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PriorityChip priority="P1" />)
    await user.hover(screen.getByText('P1'))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Priority P1: Building-wide')
  })
})
