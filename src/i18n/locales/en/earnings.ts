export default {
  earnings: {
    title: 'Earnings',
    subtitle:
      'Upcoming and recently reported earnings for your watchlist and portfolio.',
    tracked: '{count} symbol tracked | {count} symbols tracked',
    refresh: 'Refresh',
    refreshTip: 'Force re-fetch — bypasses the 12h cache',
    providerUnavailable:
      'Earnings provider unavailable — install {pkg} in the bridge environment to populate this page.',

    today: {
      title: 'Today',
      reporting: '{count} reporting',
      beat: 'BEAT',
      miss: 'MISS',
      inLine: 'IN LINE',
      reportingBadge: 'Reporting',
      eps: 'EPS',
      revenue: 'Revenue',
      epsEst: 'EPS est.',
      revenueEst: 'Revenue est.',
      actual: 'Actual',
      est: 'Est.',
      surprise: 'Surprise',
      actualsHint: 'Actuals show here once yfinance picks them up — hit Refresh after the release.',
    },

    upcoming: {
      title: 'Upcoming',
      reports: '{count} report | {count} reports',
      thisWeek: 'This week',
      nextWeek: 'Next week',
      weekOf: 'Week of {start} – {end}',
      epsEst: 'EPS est.',
      revEst: 'Rev. est.',
      last: 'Last',
      empty: 'No upcoming earnings on file. Reports populate as the bridge fetches them.',
    },

    recent: {
      title: 'Recently reported',
      last30: 'last 30 days — {count}',
      colDate: 'Date',
      colSymbol: 'Symbol',
      colEpsEst: 'EPS Est.',
      colEpsActual: 'EPS Actual',
      colSurprise: 'Surprise',
      empty: 'Nothing reported in the last 30 days.',
    },

    day: {
      today: 'Today',
      tomorrow: 'Tomorrow',
      yesterday: 'Yesterday',
      inDays: 'In {days}d',
      daysAgo: '{days}d ago',
    },
  },
}
