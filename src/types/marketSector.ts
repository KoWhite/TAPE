/** Single SPDR sector ETF snapshot — drives one tile of the board-level
 *  heatmap. All numeric fields are in native USD. */
export interface SectorEtf {
  /** ETF symbol, e.g. 'XLK'. */
  symbol: string
  /** Human sector label, e.g. 'Technology'. */
  name: string
  last: number
  prevClose: number
  /** vs prev close, native currency. */
  change: number
  /** vs prev close, decimal (0.0123 = +1.23%). */
  changePct: number
  open: number
  dayHigh: number
  dayLow: number
  volume: number
  marketCap: number
}

export interface SectorEtfResponse {
  available: boolean
  sectors: SectorEtf[]
  cachedAt: string
}
