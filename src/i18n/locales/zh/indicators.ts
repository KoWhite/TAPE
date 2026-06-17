import type en from '../en/indicators'

const indicators: typeof en = {
  indicators: {
    title: '指标实验室',
    subtitle: '任意组合技术指标 —— 基于 yfinance OHLCV 数据',
    refresh: '刷新',
    symbol: '代码',
    symbolPlaceholder: 'US.AAPL 或直接输入 AAPL',
    noBars: '{code} {period} 没有返回任何 K 线数据',
    pickSymbol: '选择一个标的开始。',
    loadingPriceChart: '正在加载价格图表',
    computing: '正在计算指标',
    waitingForData: '等待数据',
    removeIndicator: '移除指标',
    addIndicator: '添加指标',
    noParams: '无参数 —— 该指标直接根据价格/成交量计算。',
    searchPlaceholder: '搜索指标…',
    retry: '重试',
    added: '已添加',
    add: '添加',
    noMatch: '没有指标匹配「{query}」',
    categories: {
      trend: '趋势',
      momentum: '动量',
      volatility: '波动',
      volume: '成交量',
    },
  },
}

export default indicators
