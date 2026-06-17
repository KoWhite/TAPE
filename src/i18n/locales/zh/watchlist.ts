import type en from '../en/watchlist'

const watchlist: typeof en = {
  watchlist: {
    title: '自选',
    symbols: '{count} 个标的',
    all: '全部',
    uncategorized: '未分类',

    toolbar: {
      updated: '更新于 {time}',
      detail: '详细',
      compact: '紧凑',
      toCompact: '切换到紧凑视图',
      toDetail: '切换到详细视图',
      refresh: '刷新',
    },

    sort: {
      label: '排序',
      symbol: '代码',
      changePct: '涨跌幅',
      price: '价格',
    },

    banner: {
      failed: '已失败 {count} 次',
      retryingIn: '—— {seconds} 秒后重试',
      retrying: '—— 重试中…',
      retryNow: '立即重试',
    },

    empty: {
      watchlistTitle: '自选列表还没有标的',
      watchlistHint: '在设置中添加股票代码，即可开始实时跟踪报价。',
      addSymbols: '添加标的',
      categoryTitle: '该分类下没有标的',
      categoryHint: '在「设置 → 自选」中为标的分配分类，或选择其他标签。',
      showAll: '显示全部',
    },

    manager: {
      add: '添加',
      addOrManage: '添加或管理标的',
      title: '自选标的',
      subtitle: '添加、排序、分类或移除标的。当前列表：{count}。',
      reset: '重置',
      close: '关闭',
      categoryForNew: '新标的的分类',
      uncategorized: '未分类',
      added: '已添加',
      categoryFor: '{symbol} 的分类',
      remove: '移除 {symbol}',
    },
  },
}

export default watchlist
