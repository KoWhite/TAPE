import type en from '../en/compare'

const compare: typeof en = {
  compare: {
    title: '对比',
    subtitle: '叠加归一化价格曲线(基准 = 100)—— 最多可从自选中选择 8 个标的。',
    refresh: '刷新',
    selected: '已选',
    add: '添加',
    remove: '移除 {symbol}',
    err: '错误',
    loadingChart: '正在加载对比图表',
    pickPrompt: '请在上方至少选择一个标的以生成对比图表。',
    footnote:
      '每条曲线在区间起点归一化为 100,便于直接对比不同价格水平的标的。港股 / A 股仅在其本地交易日绘制。',
  },
}

export default compare
