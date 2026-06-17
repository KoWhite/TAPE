export default {
  screener: {
    title: 'Screener',
    subtitle:
      'Describe the kind of stocks you want. The AI turns it into filters, and the bridge evaluates them against your tickers.',
    prompt: 'Prompt',
    promptPlaceholder: 'e.g. semiconductors oversold but volume picking up',
    try: 'Try:',
    examples: {
      ex1: 'Tech stocks with RSI under 30 and volume above 1.2× their 20-day average',
      ex2: 'Names down more than 15% over the last 20 days but still above their 200-day SMA',
      ex3: 'Stocks trading within 2% of a fresh 60-day high',
    },
    universe: 'Universe',
    universeCombined: 'Watchlist + Portfolio ({count})',
    universeWatchlist: 'Watchlist only ({count})',
    universePortfolio: 'Portfolio only ({count})',
    compile: 'Compile',
    compiling: 'Compiling…',
    emptyUniverse:
      'Universe is empty — add tickers to your watchlist or portfolio first.',
    scanning: 'Scanning {count}…',
    runOn: 'Run on {count} tickers',
    matches: '{count} match | {count} matches',
    scanned: '· scanned {count} ticker | · scanned {count} tickers',
    skipped: '{count} skipped',
    noMatches: 'No tickers matched. Try loosening a filter or expanding the universe.',
    colSymbol: 'Symbol',
    colLast: 'Last',
    addToWatchlist: 'Add to watchlist',
    onWatchlist: 'On watchlist',
  },
}
