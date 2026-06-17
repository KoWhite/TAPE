import type en from '../en/screener'

const screener: typeof en = {
  screener: {
    title: '选股器',
    subtitle: '描述你想要的股票类型,AI 会将其转换为筛选条件,桥接端再对你的标的进行评估。',
    prompt: '描述',
    promptPlaceholder: '例如:半导体超卖但成交量正在回升',
    try: '试试:',
    examples: {
      ex1: 'RSI 低于 30 且成交量高于 20 日均量 1.2 倍的科技股',
      ex2: '近 20 天跌幅超过 15% 但仍在 200 日均线之上的标的',
      ex3: '距 60 日新高 2% 以内的股票',
    },
    universe: '范围',
    universeCombined: '自选 + 持仓({count})',
    universeWatchlist: '仅自选({count})',
    universePortfolio: '仅持仓({count})',
    compile: '编译',
    compiling: '编译中…',
    emptyUniverse: '范围为空 —— 请先向自选或持仓添加标的。',
    scanning: '扫描 {count} 个中…',
    runOn: '对 {count} 个标的运行',
    matches: '{count} 个匹配',
    scanned: '· 已扫描 {count} 个标的',
    skipped: '{count} 个已跳过',
    noMatches: '没有标的匹配。请尝试放宽筛选条件或扩大范围。',
    colSymbol: '代码',
    colLast: '最新',
    addToWatchlist: '加入自选',
    onWatchlist: '已在自选',
  },
}

export default screener
