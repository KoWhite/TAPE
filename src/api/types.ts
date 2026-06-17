import type { Quote, ConnectionStatus } from '@/types/stock'

/**
 * Provider-agnostic data interface. Implementations:
 *   - mock      → src/api/providers/mock.ts (default, no setup)
 *   - bridge    → src/api/providers/bridge.ts (calls /server JSON HTTP,
 *                 which wraps the futu-api Protobuf SDK)
 *
 * The Settings page picks which provider is active.
 */
export interface QuoteProvider {
  /** Human-readable id, e.g. 'mock', 'bridge'. */
  readonly id: string

  /** One-shot fetch for a list of codes (e.g. ['US.AAPL', 'US.NVDA']).
   *  Pass an `AbortSignal` to allow the caller to cancel an in-flight
   *  request — typically used by the polling loop to discard a stale
   *  response when a newer cycle has already started. */
  fetchQuotes(codes: string[], signal?: AbortSignal): Promise<Quote[]>

  /** Optional realtime stream — return an unsubscribe fn. */
  subscribe?(
    codes: string[],
    onTick: (quote: Quote) => void,
  ): () => void

  /** Search a symbol — used by Settings page autocomplete. */
  searchSymbols(query: string): Promise<{ code: string; symbol: string; name: string }[]>

  /** Connection health for the status pill. */
  status(): Promise<ConnectionStatus>
}
