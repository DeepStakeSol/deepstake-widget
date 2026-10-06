import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { JpoolBindUnsupported } from './JpoolBindUnsupported'

const VOTE = 'DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5'

describe('JpoolBindUnsupported', () => {
  it.each(['no_sign_message', 'off_curve'] as const)('links to JPool for %s', (reason) => {
    const { container } = render(<JpoolBindUnsupported voteAccount={VOTE} reason={reason} />)
    expect(screen.getByText(/does not support message signing/)).toBeTruthy()
    const link = screen.getByRole('link', { name: 'app.jpool.one' })
    expect(link.getAttribute('href')).toBe(`https://app.jpool.one/validators/${VOTE}/direct`)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(container.querySelector(`[data-reason="${reason}"]`)).toBeTruthy()
  })
})
