import type { QuoteProvider } from '@/api/types'
import type { Quote, ConnectionStatus } from '@/types/stock'

/**
 * Bridge provider - talks to the Tape JSON bridge (`server-py/app.py`),
 * which wraps the local Futu OpenD connection.
 *
 * Endpoints:
 *   GET  /api/health           -> { connected, source }
 *   POST /api/quotes           { codes }   -> Quote[]
 *   POST /api/search           { query }   -> SearchResult[]
 *
 * baseUrl is usually '/api' so Vite's dev proxy forwards it to
 * 127.0.0.1:8787 - see vite.config.ts.
 */
export function createBridgeProvider(opts: { baseUrl: string }): QuoteProvider {
  const baseUrl = opts.baseUrl.replace(/\/+$/, '')

  async function rpc<T>(
    path: string,
    payload?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = `${baseUrl}${path}`
    const headers: Record<string, string> = {}
    if (payload !== undefined) headers['Content-Type'] = 'application/json'

    const init: RequestInit =
      payload === undefined
        ? { method: 'GET', headers, signal }
        : {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal,
          }
    const res = await fetch(url, init)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Bridge ${res.status}: ${text || res.statusText}`)
    }
    return (await res.json()) as T
  }

  return {
    id: 'bridge',

    fetchQuotes(codes, signal) {
      return rpc<Quote[]>('/quotes', { codes }, signal)
    },

    searchSymbols(query) {
      return rpc<{ code: string; symbol: string; name: string }[]>('/search', {
        query,
      })
    },

    async status(): Promise<ConnectionStatus> {
      try {
        const t0 = performance.now()
        const data = await rpc<{
          connected: boolean
          lastError?: string
        }>('/health')
        return {
          connected: Boolean(data.connected),
          source: 'bridge',
          latencyMs: Math.round(performance.now() - t0),
          lastError: data.lastError,
        }
      } catch (e) {
        return {
          connected: false,
          source: 'bridge',
          lastError: (e as Error).message,
        }
      }
    },
  }
}
