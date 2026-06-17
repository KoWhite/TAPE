export default {
  heatmap: {
    title: 'Sector Heatmap',
    subtitle:
      "Watchlist tickers grouped by GICS sector · tile size = market cap, color = today's change",
    refresh: 'Refresh',
    empty: 'Add tickers to your watchlist to see them grouped here.',
    summary: 'Sector summary',
    weightedBy: 'weighted by tile size',
    tickers: '{count} ticker | {count} tickers',
    footnote:
      'Sector mapping comes from Yahoo Finance and is cached for 24h on the bridge. First-time loads may be slow until the cache warms.',
  },
}
