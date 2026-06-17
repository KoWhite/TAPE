import type en from '../en/heatmap'

const heatmap: typeof en = {
  heatmap: {
    title: '板块热力图',
    subtitle: '自选标的按 GICS 板块分组 · 方块大小 = 市值，颜色 = 今日涨跌',
    refresh: '刷新',
    empty: '将标的添加到自选列表，即可在此按板块分组查看。',
    summary: '板块汇总',
    weightedBy: '按方块大小加权',
    tickers: '{count} 个标的',
    footnote:
      '板块映射来自 Yahoo Finance，并在桥接端缓存 24 小时。首次加载在缓存预热前可能较慢。',
  },
}

export default heatmap
