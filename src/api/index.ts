import type { QuoteProvider } from '@/api/types'
import { mockProvider } from '@/api/providers/mock'
import { createBridgeProvider } from '@/api/providers/bridge'
import { useSettingsStore } from '@/stores/settings'

let cached: { id: string; baseUrl: string; provider: QuoteProvider } | null =
  null

/**
 * Resolve the active provider based on Settings store state. Re-creates the
 * client when the user switches data source or changes the bridge URL.
 */
export function getProvider(): QuoteProvider {
  const settings = useSettingsStore()
  const id = settings.dataSource
  const baseUrl = settings.bridge.baseUrl

  if (cached && cached.id === id && cached.baseUrl === baseUrl) {
    return cached.provider
  }

  const provider =
    id === 'bridge' ? createBridgeProvider({ baseUrl }) : mockProvider

  cached = { id, baseUrl, provider }
  return provider
}

export type { QuoteProvider }
