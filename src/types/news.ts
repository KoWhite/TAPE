/** Single Yahoo Finance news item, flattened for the frontend. */
export interface NewsItem {
  id: string
  title: string
  summary: string
  url: string
  /** Display name of the publishing source (e.g. "Reuters"). */
  provider: string
  /** ISO 8601 publish timestamp. May be empty when Yahoo omits it. */
  publishedAt: string
  /** Optional thumbnail URL — null when Yahoo has no image for the item. */
  thumbnail?: string | null
  /** Yahoo content type — STORY / VIDEO / etc. Used to render a small chip. */
  type?: string
}

export interface NewsResponse {
  available: boolean
  /** Present on per-ticker responses; absent on the market endpoint. */
  code?: string
  symbol?: string
  items: NewsItem[]
  cachedAt: string
}
