/**
 * CNN Fear & Greed Index — shape returned by `/api/cnn/fear-greed`.
 *
 * Ratings come straight from CNN as lowercase strings:
 *   'extreme fear' | 'fear' | 'neutral' | 'greed' | 'extreme greed'
 * The score is 0–100 (0 = extreme fear, 100 = extreme greed).
 */

export type FearGreedRating =
  | 'extreme fear'
  | 'fear'
  | 'neutral'
  | 'greed'
  | 'extreme greed'

export interface FearGreedHistory {
  previousClose: number | null
  oneWeek: number | null
  oneMonth: number | null
  oneYear: number | null
}

export interface FearGreedSparklinePoint {
  /** ISO timestamp. */
  date: string
  value: number | null
}

export interface FearGreedIndicator {
  id: string
  label: string
  description: string
  score: number | null
  rating: FearGreedRating | string | null
}

export interface FearGreed {
  /** 0–100. */
  score: number | null
  rating: FearGreedRating | string | null
  /** ISO timestamp from CNN — when the index was last computed. */
  updatedAt: string
  history: FearGreedHistory
  sparkline: FearGreedSparklinePoint[]
  indicators: FearGreedIndicator[]
  source: 'cnn'
  /** ISO timestamp from the bridge — when the cache entry was written. */
  cachedAt: string
}
