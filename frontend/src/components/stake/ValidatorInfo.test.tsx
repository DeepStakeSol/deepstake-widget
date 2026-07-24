import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/imageUrl', () => ({
  cssImageUrl: vi.fn((src: string) => 'url("' + src + '")'),
  getImageUrl: vi.fn((src: string) => src),
}))

import { ValidatorInfo } from './ValidatorInfo'

describe('ValidatorInfo', () => {
  it('shows the configured vote account when metadata is unavailable', () => {
    render(<ValidatorInfo validatorInfo={null} voteAccount="1234567890abcdefghij" />)

    expect(screen.getByText('Validator')).toBeInTheDocument()
    expect(screen.getByText('Vote Account: 1234...ghij')).toBeInTheDocument()
    const placeholder = screen.getByRole('img', { name: 'Validator logo' })
    expect(placeholder).toHaveClass('vi-avatar')
    expect(placeholder.tagName).toBe('DIV')
  })

  it('falls back when the remote logo cannot load', () => {
    render(
      <ValidatorInfo
        validatorInfo={{
          name: 'Example',
          logoUrl: 'https://logo.example/broken.png',
        } as never}
        voteAccount="vote-account"
      />
    )

    const image = screen.getByRole('img', { name: 'Example logo' })
    expect(image).toHaveAttribute('src', 'https://logo.example/broken.png')
    fireEvent.error(image)
    const placeholder = screen.getByRole('img', { name: 'Example logo' })
    expect(placeholder).toHaveClass('vi-avatar')
    expect(placeholder.tagName).toBe('DIV')
  })
})
