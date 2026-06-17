import type en from '../en/earnings'

const earnings: typeof en = {
  earnings: {
    title: '财报',
    subtitle: '自选与持仓标的的即将公布及近期已公布财报。',
    tracked: '跟踪 {count} 个标的',
    refresh: '刷新',
    refreshTip: '强制重新拉取 —— 绕过 12 小时缓存',
    providerUnavailable: '财报数据源不可用 —— 请在桥接环境中安装 {pkg} 以填充此页。',

    today: {
      title: '今日',
      reporting: '{count} 家公布',
      beat: '超预期',
      miss: '不及预期',
      inLine: '符合预期',
      reportingBadge: '待公布',
      eps: '每股收益',
      revenue: '营收',
      epsEst: '每股收益预期',
      revenueEst: '营收预期',
      actual: '实际',
      est: '预期',
      surprise: '超预期幅度',
      actualsHint: 'yfinance 收录后实际数据将显示在此 —— 公布后请点击刷新。',
    },

    upcoming: {
      title: '即将公布',
      reports: '{count} 份',
      thisWeek: '本周',
      nextWeek: '下周',
      weekOf: '{start} – {end} 当周',
      epsEst: '每股收益预期',
      revEst: '营收预期',
      last: '最新',
      empty: '暂无即将公布的财报记录。随桥接拉取后会自动填充。',
    },

    recent: {
      title: '近期已公布',
      last30: '近 30 天 —— {count}',
      colDate: '日期',
      colSymbol: '代码',
      colEpsEst: '每股收益预期',
      colEpsActual: '每股收益实际',
      colSurprise: '超预期幅度',
      empty: '近 30 天无财报公布。',
    },

    day: {
      today: '今天',
      tomorrow: '明天',
      yesterday: '昨天',
      inDays: '{days} 天后',
      daysAgo: '{days} 天前',
    },
  },
}

export default earnings
