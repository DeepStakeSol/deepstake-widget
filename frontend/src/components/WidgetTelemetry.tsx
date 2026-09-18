import { useEffect, useRef } from 'react'

import type { Options, WidgetTab } from '../options'
import type { NetworkType } from '../utils/config'

export const DEFAULT_TELEMETRY_ENDPOINT = 'https://deepstake.info/api/telemetry'

export function getTelemetryEndpoint(
  configuredEndpoint = import.meta.env.VITE_TELEMETRY_ENDPOINT
): string {
  return configuredEndpoint?.trim() || DEFAULT_TELEMETRY_ENDPOINT
}

export const TELEMETRY_ENDPOINT = getTelemetryEndpoint()

export type WidgetMountTelemetry = {
  event: 'widget_mount'
  hostname: string
  vote_account: string
  network: NetworkType
  tabs: WidgetTab[]
  theme: 'light' | 'dark'
  version: string
}

export function createWidgetMountTelemetry(
  options: Options,
  network: NetworkType,
  tabs: readonly WidgetTab[],
  hostname = window.location.hostname
): WidgetMountTelemetry {
  return {
    event: 'widget_mount',
    hostname,
    vote_account: options.vote_account,
    network,
    tabs: [...tabs],
    theme: options.theme === 'light' ? 'light' : 'dark',
    version: import.meta.env.VITE_WIDGET_VERSION,
  }
}

export function sendWidgetMountTelemetry(payload: WidgetMountTelemetry): void {
  const body = JSON.stringify(payload)

  try {
    if (
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(TELEMETRY_ENDPOINT, body)
    ) {
      return
    }
  } catch {
    // A rejected Beacon falls through to the best-effort fetch transport.
  }

  try {
    void fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      body,
      keepalive: true,
      mode: 'no-cors',
    }).catch(() => undefined)
  } catch {
    // Telemetry must never affect the host page or widget mount.
  }
}

export function WidgetTelemetry({
  options,
  network,
  tabs,
}: {
  options: Options
  network: NetworkType
  tabs: readonly WidgetTab[]
}) {
  const sent = useRef(false)

  useEffect(() => {
    if (sent.current || options.telemetry === false || tabs.length === 0) return
    sent.current = true
    sendWidgetMountTelemetry(createWidgetMountTelemetry(options, network, tabs))
  }, [network, options, tabs])

  return null
}
