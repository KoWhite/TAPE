// 外壳与全局框架文案（侧边栏导航、顶栏、路由标题、设置页）。
import type en from '../en/shell'

const shell: typeof en = {
  app: {
    name: 'Tape',
    tagline: '美股交易台',
  },

  routes: {
    overview: '概览',
    watchlist: '自选',
    movers: '异动',
    heatmap: '热力图',
    indicators: '指标实验室',
    backtest: '回测',
    screener: '选股器',
    compare: '对比',
    portfolio: '持仓',
    alerts: '提醒',
    earnings: '财报',
    macro: '宏观',
    settings: '设置',
    'stock-detail': '详情',
    'not-found': '页面未找到',
  },

  nav: {
    groups: {
      daily: '每日',
      research: '研究',
      manage: '管理',
    },
    localBridge: '本地桥接',
    bridgeSubtitle: '经 Tape 接入 Futu OpenAPI',
    futuOpenApi: 'Futu OpenAPI',
    openMenu: '打开菜单',
    closeMenu: '关闭菜单',
  },

  header: {
    session: {
      open: '开盘',
      closed: '休市',
      preMarket: '盘前',
      afterHours: '盘后',
    },
    dataSource: '数据源',
    sourceBridge: '桥接 · Futu',
    sourceMock: '模拟',
    toggleTheme: '切换主题',
    themeLabel: '主题',
    language: '语言',
    switchLanguage: '切换语言',
  },

  common: {
    language: {
      en: 'English',
      zh: '中文',
    },
    manage: '管理',
    refresh: '刷新',
    retry: '重试',
    loading: '加载中…',
    cancel: '取消',
    save: '保存',
    close: '关闭',
    delete: '删除',
    edit: '编辑',
    add: '添加',
    today: '今天',
    notSynced: '未同步',
    updated: '更新于 {time}',
  },

  ticker: {
    open: '开盘',
    highLow: '最高 · 最低',
    vol: '成交量',
    removeFromWatchlist: '从自选移除',
    removeTicker: '移除标的',
    remove: '移除 {symbol}',
    noLiveData: '（无实时数据 —— 显示盘中）',
    session: {
      pre: '盘前',
      after: '盘后',
      overnight: '夜盘',
    },
    sessionMeta: {
      preMarketLabel: '盘前',
      preMarketShort: '盘前',
      regularLabel: '盘中',
      regularShort: '盘中',
      afterHoursLabel: '盘后',
      afterHoursShort: '盘后',
      overnightLabel: '夜盘',
      overnightShort: '夜盘',
    },
  },
}

export default shell
