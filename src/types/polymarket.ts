/**
 * Polymarket Gamma API — top events by 24h volume.
 *
 * An "event" is the top-level container (e.g. "2024 US Presidential
 * Election"). Each event holds 1+ "markets" — for binary events that's
 * just the yes/no question; for grouped events (elections, season-long
 * NBA winner picks, etc.) each market is one yes/no question per
 * candidate/team, and `groupItemTitle` carries the candidate name.
 *
 * `outcomes` and `outcomePrices` are decoded from JSON-strings server-side
 * (the bridge does it) so the client gets a clean array of label/price.
 */

export interface PolymarketOutcome {
  /** Human label — typically 'Yes' / 'No', or candidate name in old multi-option markets. */
  label: string
  /** Price in [0, 1], interpretable as the implied probability. null if missing. */
  price: number | null
}

export interface PolymarketMarket {
  id: string | null
  question: string
  /** Set on grouped events (e.g. 'Trump' in an election event). null on
   *  binary single-market events — UI renders Yes/No directly in that case. */
  groupItemTitle: string | null
  outcomes: PolymarketOutcome[]
  volume24hr: number | null
  endDate: string | null
}

export interface PolymarketEvent {
  id: string
  /** URL slug — used to deep-link into polymarket.com/event/{slug}. */
  slug: string
  title: string
  description: string | null
  category: string | null
  image: string | null
  endDate: string | null
  volume24hr: number | null
  liquidity: number | null
  markets: PolymarketMarket[]
}

export interface PolymarketTop {
  events: PolymarketEvent[]
  source: 'polymarket'
  /** ISO timestamp from the bridge — when the cache entry was written. */
  cachedAt: string
}
