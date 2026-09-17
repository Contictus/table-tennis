import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MatchHelp from './MatchHelp'

describe('MatchHelp', () => {
  it('shows controls and closes from both actions', () => {
    const onClose = vi.fn()
    render(<MatchHelp onClose={onClose} />)

    expect(screen.getByRole('dialog', { name: 'Play the rally.' })).toBeInTheDocument()
    expect(screen.getByText('Drag to move')).toBeInTheDocument()
    expect(screen.getByText('First to 11')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close help' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to match' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
