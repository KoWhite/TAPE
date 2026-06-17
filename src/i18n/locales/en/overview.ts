export default {
  overview: {
    // index header
    greeting: {
      lateNight: 'Late night',
      morning: 'Good morning',
      afternoon: 'Good afternoon',
      evening: 'Good evening',
    },
    subtitle: 'market overview at a glance',
    marketContext: 'Market context',
    marketContextHint:
      'Heatmaps, headlines, and prediction markets stay tucked away until needed.',
    showContext: 'Show context',
    hideContext: 'Hide context',

    // TodayFocusCard
    focus: {
      eyebrow: 'Today focus',
      title: 'What needs attention first',
      updated: 'Updated {time}',
      portfolioToday: 'Portfolio today',
      priced: '{priced}/{total} priced',
      alertState: 'Alert state',
      triggeredActive: 'triggered / active',
      marketMood: 'Market mood',
      moodPending: 'Market mood pending',
      moodPendingDetail: 'Fear & Greed has not loaded yet.',
      moodDefault: 'Market mood',
      fearGreedScore: 'Fear & Greed {score}/100',
      watchThisWeek: 'Watch this week',
      noEarnings: 'No tracked earnings in the next 7 days.',
      strongestMove: 'Strongest watchlist move',
      noMovers: 'Add symbols or refresh quotes to populate movers.',
      // primary action card
      alertsTriggered: '{count} alert triggered | {count} alerts triggered',
      alertsTriggeredDetail: 'Review triggered rules before making new decisions.',
      reportsToday: '{code} reports today',
      reportsInDays: '{code} reports in {days}d',
      earningsThisWeek:
        '{count} tracked earnings event this week. | {count} tracked earnings events this week.',
      isMoving: '{symbol} is moving {pct}',
      isMovingDetail: 'Open movers to inspect the strongest watchlist changes.',
      buildWatchlist: 'Build your watchlist',
      buildWatchlistDetail: 'Add symbols to turn this into a live decision feed.',
    },

    // PortfolioSummaryCard
    portfolio: {
      title: 'Portfolio',
      positions: '{count} position | {count} positions',
      manage: 'Manage',
      managePositions: 'Manage positions',
      emptyTitle: 'No positions tracked',
      emptyHint: 'Add holdings to see live P&L and a daily history curve here.',
      addPosition: 'Add position',
      marketValue: 'Market value',
      priced: '{priced}/{total} priced',
      today: 'Today',
      totalPnl: 'Total P&L',
      costBasis: 'Cost basis',
    },

    // AiDailyBriefCard
    brief: {
      title: 'AI Daily Brief',
      liveSearch: 'Live search',
      liveSearchTip: 'Model can call Tavily web search for fresh information',
      subtitle: 'Portfolio, alerts, earnings, news, and sentiment in one summary.',
      cachedToday: 'Cached today {time}',
      generate: 'Generate',
      regenerate: 'Regenerate',
      noProvider:
        'Configure an AI provider in the bridge environment to generate the brief.',
      thinking: 'Model is thinking',
      thoughtProcess: 'Thought process',
      collapse: 'collapse',
      expand: 'expand',
      chars: '{count} chars',
      kchars: '{count}k chars',
      emptyHint:
        'Generate a short Chinese daily brief from the data already loaded in Tape.',
      hints: {
        context: 'Collecting portfolio context',
        alerts: 'Checking alerts and earnings',
        headlines: 'Reading market headlines',
        news: 'Searching live news',
        prepare: 'Preparing daily brief',
      },
    },

    // AiPortfolioActionsCard
    actions: {
      title: 'Portfolio Actions',
      subtitle:
        'AI-generated next steps across {count} position | AI-generated next steps across {count} positions',
      thinking: 'Thinking…',
      refresh: 'Refresh',
      suggest: 'Suggest',
      confidence: '{pct}% conf',
      shares: '{count} sh',
      applyToExitPlan: 'Apply to exit plan',
      emptyHint: 'Click Suggest for AI-generated portfolio-wide recommendations.',
      labels: {
        buy: 'Buy',
        sell: 'Sell',
        hold: 'Hold',
        trim: 'Trim',
        stop_loss: 'Stop loss',
        take_profit: 'Take profit',
      },
    },

    // MarketNewsCard
    news: {
      title: 'Market News',
      source: 'Yahoo Finance',
      cached: 'Cached {time}',
      refresh: 'Refresh',
      refreshTip: 'Refresh from Yahoo Finance',
      retry: 'Retry',
      empty: 'No market headlines right now.',
    },

    // MarketHeatmapCard
    marketHeatmap: {
      title: 'US Market Heatmap',
      source: 'TradingView · sector · market-cap weighted',
      trackAll: 'Track all markets on TradingView',
      universe: {
        sp500: 'S&P 500',
        ndx: 'Nasdaq 100',
        dj: 'Dow 30',
        all: 'All US',
      },
    },

    // SectorHeatmapCard
    sectorHeatmap: {
      title: 'Sector Performance',
      source: 'SPDR · today',
      synced: 'Synced {time}',
      refresh: 'Refresh',
      refreshTip: 'Refresh sector quotes',
      retry: 'Retry',
      up: 'up',
      flat: 'flat',
      down: 'down',
      avg: 'Avg',
      sectorsUp: '{count} sectors up',
      sectorsFlat: '{count} sectors flat',
      sectorsDown: '{count} sectors down',
      empty: 'No sector data yet.',
    },

    // FearGreedCard
    fearGreed: {
      title: 'Fear & Greed Index',
      refresh: 'Refresh',
      refreshTip: 'Refresh from CNN — bypasses bridge cache',
      retry: 'Retry',
      updated: 'Updated {time}',
      cached: 'cached {time}',
      zones: {
        extremeFear: 'Extreme Fear',
        fear: 'Fear',
        neutral: 'Neutral',
        greed: 'Greed',
        extremeGreed: 'Extreme Greed',
      },
      trajectory: 'Trajectory · 6 months',
      range: 'range {min} – {max}',
      prevClose: 'Prev close',
      oneWeek: '1 week ago',
      oneMonth: '1 month ago',
      oneYear: '1 year ago',
      indicatorsTitle: '7 indicators · equally weighted',
    },

    // PolymarketTopCard
    polymarket: {
      title: 'Polymarket',
      source: 'Top 10 · 24h volume',
      cached: 'Cached {time}',
      open: 'Open',
      openTip: 'Open Polymarket',
      refresh: 'Refresh',
      refreshTip: 'Refresh from Polymarket — bypasses bridge cache',
      retry: 'Retry',
      noEvents: 'No active events.',
      noMarkets: 'No active markets.',
      yes: 'Yes',
      no: 'No',
      more: '+{count} more',
      ended: 'Ended',
      today: 'Today',
      tomorrow: 'Tomorrow',
    },
  },
}
