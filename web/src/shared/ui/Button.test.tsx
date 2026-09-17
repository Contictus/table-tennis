import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Button from './Button'

describe('Button', () => {
  it('renders its action label and supports disabled state', () => {
    render(<Button disabled>Ready</Button>)
    expect(screen.getByRole('button', { name: 'Ready' })).toBeDisabled()
  })
})
