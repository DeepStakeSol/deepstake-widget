import { StrictMode } from 'react'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createWidgetMountTelemetry,
  DEFAULT_TELEMETRY_ENDPOINT,
  getTelemetryEndpoint,
  sendWidgetMountTelemetry,
  TELEMETRY_ENDPOINT,
  WidgetTelemetry,
  type WidgetMountTelemetry,
} from './WidgetTelemetry'
import { getEffectiveTabs } from '../utils/effectiveTabs'

const options = {
  vote_account: 'Vote111111111111111111111111111111111111111',
  theme: 'light' as const,
}

const payload: WidgetMountTelemetry = {
  event: 'widget_mount',
  hostname: 'validator.example',
  vote_account: options.vote_account,
  network: 'devnet',
  tabs: ['native', 'blaze'],
  theme: 'light',
  version: '1.1.0',
}

describe('widget mount telemetry', () => {
  const sendBeacon = vi.fn()
  const fetchMock = vi.fn()

  beforeEach(() => {
    sendBeacon.mockReset().mockReturnValue(true)
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('navigator', { sendBeacon })
    vi.stubGlobal('fetch', fetchMock)
  })

  it('uses the production endpoint by default and trims an override', () => {
    expect(getTelemetryEndpoint()).toBe(DEFAULT_TELEMETRY_ENDPOINT)
    expect(getTelemetryEndpoint(' https://telemetry.local/collect ')).toBe(
      'https://telemetry.local/collect'
    )
    expect(getTelemetryEndpoint('   ')).toBe(DEFAULT_TELEMETRY_ENDPOINT)
  })

  it('builds a normalized payload with effective devnet tabs', () => {
    const effective = getEffectiveTabs(['blaze', 'vault'], 'devnet')

    expect(
      createWidgetMountTelemetry(options, 'devnet', effective.tabs, 'VALIDATOR.Example')
    ).toEqual({
      ...payload,
      hostname: 'VALIDATOR.Example',
      tabs: ['blaze'],
    })
  })

  it('uses Beacon with a simple string body', () => {
    sendWidgetMountTelemetry(payload)

    expect(sendBeacon).toHaveBeenCalledWith(TELEMETRY_ENDPOINT, JSON.stringify(payload))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to a best-effort no-cors fetch when Beacon fails', () => {
    sendBeacon.mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(() => sendWidgetMountTelemetry(payload)).not.toThrow()
    expect(fetchMock).toHaveBeenCalledWith(TELEMETRY_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(payload),
      keepalive: true,
      mode: 'no-cors',
    })
  })

  it('sends once under Strict Mode and once for each independent instance', () => {
    render(
      <StrictMode>
        <WidgetTelemetry options={options} network="devnet" tabs={['native']} />
        <WidgetTelemetry options={options} network="devnet" tabs={['native']} />
      </StrictMode>
    )

    expect(sendBeacon).toHaveBeenCalledTimes(2)
  })

  it('honors opt-out and skips invalid empty-tab mounts', () => {
    const { rerender } = render(
      <WidgetTelemetry
        options={{ ...options, telemetry: false }}
        network="devnet"
        tabs={['native']}
      />
    )
    expect(sendBeacon).not.toHaveBeenCalled()

    rerender(<WidgetTelemetry options={options} network="devnet" tabs={[]} />)
    expect(sendBeacon).not.toHaveBeenCalled()
  })
})
