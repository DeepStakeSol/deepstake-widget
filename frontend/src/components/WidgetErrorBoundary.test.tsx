import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WidgetErrorBoundary } from './WidgetErrorBoundary'

function BrokenWidget(): never {
  throw new Error('render exploded')
}

describe('WidgetErrorBoundary', () => {
  it('renders a local fallback and logs the failing mount element', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const mountElement = document.createElement('div')

    render(
      <WidgetErrorBoundary mountElement={mountElement}>
        <BrokenWidget />
      </WidgetErrorBoundary>
    )

    expect(screen.getByRole('alert')).toHaveTextContent('DeepStake widget: unable to render')
    expect(
      consoleError.mock.calls.some(
        ([message, element, error]) =>
          message === '[DeepStake widget] render failed' &&
          element === mountElement &&
          error instanceof Error &&
          error.message === 'render exploded'
      )
    ).toBe(true)
  })
})
