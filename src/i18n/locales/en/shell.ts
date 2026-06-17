// Shell + global chrome messages (sidebar nav, header, route titles, Settings).
// One namespace per concern; per-view copy lives in sibling files.
export default {
  // App-level / brand
  app: {
    name: 'Tape',
    tagline: 'US equity desk',
  },

  // Route titles — keyed by route `name` (see src/router/index.ts).
  // Used for the sidebar nav label, the header H1, and document.title.
  routes: {
    overview: 'Overview',
    watchlist: 'Watchlist',
    movers: 'Movers',
    heatmap: 'Heatmap',
    indicators: 'Indicator Lab',
    backtest: 'Backtest',
    screener: 'Screener',
    compare: 'Compare',
    portfolio: 'Portfolio',
    alerts: 'Alerts',
    earnings: 'Earnings',
    macro: 'Macro',
    settings: 'Settings',
    'stock-detail': 'Detail',
    'not-found': 'Not Found',
  },

  // Sidebar groupings + footer
  nav: {
    groups: {
      daily: 'Daily',
      research: 'Research',
      manage: 'Manage',
    },
    localBridge: 'Local bridge',
    bridgeSubtitle: 'Futu OpenAPI via Tape',
    futuOpenApi: 'Futu OpenAPI',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
  },

  // Top header
  header: {
    session: {
      open: 'Open',
      closed: 'Closed',
      preMarket: 'Pre-Market',
      afterHours: 'After-Hours',
    },
    dataSource: 'Data source',
    sourceBridge: 'Bridge · Futu',
    sourceMock: 'Mock',
    toggleTheme: 'Toggle theme',
    themeLabel: 'Theme',
    language: 'Language',
    switchLanguage: 'Switch language',
  },

  // Shared / common UI atoms reused across views
  common: {
    language: {
      en: 'English',
      zh: '中文',
    },
    manage: 'Manage',
    refresh: 'Refresh',
    retry: 'Retry',
    loading: 'Loading…',
    cancel: 'Cancel',
    save: 'Save',
    close: 'Close',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    today: 'Today',
    notSynced: 'not synced',
    updated: 'Updated {time}',
  },

  // Shared ticker card / row (Watchlist, Movers)
  ticker: {
    open: 'Open',
    highLow: 'High · Low',
    vol: 'Vol',
    removeFromWatchlist: 'Remove from watchlist',
    removeTicker: 'Remove ticker',
    remove: 'Remove {symbol}',
    noLiveData: ' (no live data — showing RTH)',
    session: {
      pre: 'Pre',
      after: 'After',
      overnight: 'Overnight',
    },
    // SESSION_META labels (full + short) keyed by ActiveSessionKind
    sessionMeta: {
      preMarketLabel: 'Pre-market',
      preMarketShort: 'Pre',
      regularLabel: 'Regular hours',
      regularShort: 'RTH',
      afterHoursLabel: 'After-hours',
      afterHoursShort: 'After',
      overnightLabel: 'Overnight',
      overnightShort: 'Overnight',
    },
  },
}
