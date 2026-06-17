/**
 * Pure technical-setup scoring used by the StockDetail AI analysis card.
 *
 * Given OHLCV bars + a quote, `computeTechnicalSetup` derives a 0-100
 * directional score plus the levels (support/resistance/MA/RSI/MACD/Boll/
 * ATR/volume/range) the UI renders and the AI prompt summarizes. No Vue
 * dependency — keep it that way so it stays unit-testable.
 */
import { boll, ema, macd, rsi, sma } from '@/utils/indicators'
import { formatChange, formatCompact, formatPercent, formatRevenueCompact } from '@/utils/format'
import type { EarningsRecord } from '@/types/earnings'
import type { InstitutionalContext } from '@/types/institutional'
import type { KlineBar } from '@/types/kline'
import type { Quote } from '@/types/stock'

export type SetupTone = 'buy' | 'wait' | 'sell'

export interface PriceLevel {
  price: number
  distance: number
}

export interface TechnicalSetup {
  tone: SetupTone
  label: string
  score: number
  summary: string
  support: PriceLevel | null
  resistance: PriceLevel | null
  ma: Record<'ma5' | 'ma10' | 'ma20' | 'ma50' | 'ma100' | 'ma200', number | null>
  ema: Record<'ema12' | 'ema26', number | null>
  rsi: Record<'rsi6' | 'rsi14' | 'rsi24', number | null>
  macd: Record<'dif' | 'dea' | 'hist' | 'prevHist', number | null>
  boll: Record<'upper' | 'middle' | 'lower' | 'bandwidth' | 'percentB', number | null>
  atr14: number | null
  volume: Record<'latest' | 'ma20' | 'ratio', number | null>
  range: Record<'high20' | 'low20' | 'high60' | 'low60' | 'high120' | 'low120', number | null>
  position: Record<'from52wHigh' | 'from52wLow', number | null>
  trigger: string
  invalidation: string
}

export function lastFinite(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const value = values[i]
    if (value !== null && Number.isFinite(value)) return value
  }
  return null
}

function dedupeLevels(levels: number[], current: number): number[] {
  const out: number[] = []
  for (const level of levels) {
    if (!Number.isFinite(level) || level <= 0) continue
    const duplicate = out.some((x) => Math.abs(x / level - 1) < 0.008)
    if (!duplicate && Math.abs(level / current - 1) < 0.35) out.push(level)
    if (out.length >= 3) break
  }
  return out
}

function nearestSupportResistance(bars: KlineBar[], current: number) {
  const recent = bars.slice(-90)
  const supports: number[] = []
  const resistances: number[] = []
  for (let i = 2; i < recent.length - 2; i++) {
    const prev = recent[i - 1]
    const bar = recent[i]
    const next = recent[i + 1]
    if (bar.low <= prev.low && bar.low <= next.low && bar.low < current) supports.push(bar.low)
    if (bar.high >= prev.high && bar.high >= next.high && bar.high > current) resistances.push(bar.high)
  }
  const fallbackLows = recent.map((b) => b.low).filter((v) => v < current)
  const fallbackHighs = recent.map((b) => b.high).filter((v) => v > current)
  const supportLevels = dedupeLevels(
    [...supports, ...fallbackLows].sort((a, b) => b - a),
    current,
  )
  const resistanceLevels = dedupeLevels(
    [...resistances, ...fallbackHighs].sort((a, b) => a - b),
    current,
  )
  const support = supportLevels[0]
  const resistance = resistanceLevels[0]
  return {
    support: support ? { price: support, distance: current / support - 1 } : null,
    resistance: resistance ? { price: resistance, distance: resistance / current - 1 } : null,
  }
}

export function fmtPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--'
  return value >= 100 ? value.toFixed(2) : value.toFixed(3)
}

export function fmtSigned(value: number | null, digits = 3): string {
  if (value === null || !Number.isFinite(value)) return '--'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}`
}

export function fmtPlainPercent(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '--'
  return `${(value * 100).toFixed(digits)}%`
}

export function fmtOptionalPercent(value: number | null | undefined): string {
  return value == null ? 'n/a' : formatPercent(value)
}

function highest(bars: KlineBar[], count: number): number | null {
  const values = bars.slice(-count).map((b) => b.high).filter(Number.isFinite)
  return values.length ? Math.max(...values) : null
}

function lowest(bars: KlineBar[], count: number): number | null {
  const values = bars.slice(-count).map((b) => b.low).filter(Number.isFinite)
  return values.length ? Math.min(...values) : null
}

function atr(bars: KlineBar[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null)
  if (bars.length <= period) return out
  const tr: number[] = []
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]
    const prevClose = i > 0 ? bars[i - 1].close : bar.close
    tr.push(Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - prevClose),
      Math.abs(bar.low - prevClose),
    ))
  }
  let prev = tr.slice(1, period + 1).reduce((sum, value) => sum + value, 0) / period
  out[period] = prev
  for (let i = period + 1; i < tr.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period
    out[i] = prev
  }
  return out
}

export function computeTechnicalSetup(bars: KlineBar[], quote: Quote | null): TechnicalSetup | null {
  const current = quote?.last ?? bars.at(-1)?.close
  if (!current || bars.length < 30) return null

  const closes = bars.map((b) => b.close)
  const volumes = bars.map((b) => b.volume)
  const ma = {
    ma5: lastFinite(sma(closes, 5)),
    ma10: lastFinite(sma(closes, 10)),
    ma20: lastFinite(sma(closes, 20)),
    ma50: lastFinite(sma(closes, 50)),
    ma100: lastFinite(sma(closes, 100)),
    ma200: lastFinite(sma(closes, 200)),
  }
  const emaPack = {
    ema12: lastFinite(ema(closes, 12)),
    ema26: lastFinite(ema(closes, 26)),
  }
  const rsiPack = {
    rsi6: lastFinite(rsi(closes, 6)),
    rsi14: lastFinite(rsi(closes, 14)),
    rsi24: lastFinite(rsi(closes, 24)),
  }
  const macdPack = macd(closes)
  const macdValues = {
    dif: lastFinite(macdPack.dif),
    dea: lastFinite(macdPack.dea),
    hist: lastFinite(macdPack.hist),
    prevHist: lastFinite(macdPack.hist.slice(0, -1)),
  }
  const bands = boll(closes, 20, 2)
  const bollUpper = lastFinite(bands.upper)
  const bollMiddle = lastFinite(bands.middle)
  const bollLower = lastFinite(bands.lower)
  const bollWidth =
    bollUpper !== null && bollLower !== null && bollMiddle
      ? (bollUpper - bollLower) / bollMiddle
      : null
  const bollPercentB =
    bollUpper !== null && bollLower !== null && bollUpper !== bollLower
      ? (current - bollLower) / (bollUpper - bollLower)
      : null
  const atr14 = lastFinite(atr(bars, 14))
  const volumeMa20 = lastFinite(sma(volumes, 20))
  const latestVolume = bars.at(-1)?.volume ?? null
  const volumeRatio = latestVolume !== null && volumeMa20 ? latestVolume / volumeMa20 : null
  const { support, resistance } = nearestSupportResistance(bars, current)
  const range = {
    high20: highest(bars, 20),
    low20: lowest(bars, 20),
    high60: highest(bars, 60),
    low60: lowest(bars, 60),
    high120: highest(bars, 120),
    low120: lowest(bars, 120),
  }
  const position = {
    from52wHigh: quote?.high52w ? current / quote.high52w - 1 : null,
    from52wLow: quote?.low52w ? current / quote.low52w - 1 : null,
  }

  let score = 50
  if (ma.ma5 && ma.ma10) score += ma.ma5 > ma.ma10 ? 4 : -4
  if (ma.ma20) score += current > ma.ma20 ? 8 : -8
  if (ma.ma50) score += current > ma.ma50 ? 8 : -8
  if (ma.ma20 && ma.ma50) score += ma.ma20 > ma.ma50 ? 7 : -7
  if (ma.ma100 && ma.ma200) score += ma.ma100 > ma.ma200 ? 4 : -4
  if (ma.ma200) score += current > ma.ma200 ? 6 : -6
  if (emaPack.ema12 && emaPack.ema26) score += emaPack.ema12 > emaPack.ema26 ? 5 : -5
  if (rsiPack.rsi14 !== null) {
    if (rsiPack.rsi14 < 30) score += 7
    else if (rsiPack.rsi14 > 72) score -= 9
    else if (rsiPack.rsi14 >= 45 && rsiPack.rsi14 <= 62) score += 4
  }
  if (rsiPack.rsi6 !== null && rsiPack.rsi24 !== null) score += rsiPack.rsi6 > rsiPack.rsi24 ? 3 : -3
  if (macdValues.hist !== null) score += macdValues.hist > 0 ? 8 : -8
  if (macdValues.hist !== null && macdValues.prevHist !== null) {
    score += macdValues.hist > macdValues.prevHist ? 4 : -4
  }
  if (support && support.distance <= 0.035) score += 5
  if (resistance && resistance.distance <= 0.035) score -= 6
  if (bollUpper && current > bollUpper) score -= 5
  if (bollLower && current < bollLower) score += 5
  if (volumeRatio !== null && volumeRatio >= 1.2 && current > (ma.ma20 ?? current)) score += 4
  if (range.high60 && Math.abs(current / range.high60 - 1) <= 0.015) score -= 3
  score = Math.max(0, Math.min(100, Math.round(score)))

  const tone: SetupTone = score >= 64 ? 'buy' : score <= 38 ? 'sell' : 'wait'
  const label =
    tone === 'buy' ? 'Buy setup' : tone === 'sell' ? 'Sell / risk-off' : 'Wait for trigger'
  const aboveMa20 = ma.ma20 ? current >= ma.ma20 : false
  const aboveMa50 = ma.ma50 ? current >= ma.ma50 : false
  const summary =
    tone === 'buy'
      ? `Trend is constructive while price holds ${aboveMa20 ? 'above MA20' : 'near the short trend'}.`
      : tone === 'sell'
        ? 'Momentum is weak or price is close to overhead supply.'
        : 'Signal is mixed; confirmation matters more than prediction.'
  const trigger = resistance
    ? `Break and hold above ${fmtPrice(resistance.price)}`
    : aboveMa20 && aboveMa50
      ? 'Hold above MA20/MA50 with improving volume'
      : 'Reclaim MA20 with positive momentum'
  const invalidation = support
    ? `Lose ${fmtPrice(support.price)} on volume`
    : ma.ma20
      ? `Close below MA20 (${fmtPrice(ma.ma20)})`
      : 'New lower low'

  return {
    tone,
    label,
    score,
    summary,
    support,
    resistance,
    ma,
    ema: emaPack,
    rsi: rsiPack,
    macd: macdValues,
    boll: {
      upper: bollUpper,
      middle: bollMiddle,
      lower: bollLower,
      bandwidth: bollWidth,
      percentB: bollPercentB,
    },
    atr14,
    volume: {
      latest: latestVolume,
      ma20: volumeMa20,
      ratio: volumeRatio,
    },
    range,
    position,
    trigger,
    invalidation,
  }
}

// ── Prompt builders ──────────────────────────────────────────────────────

function trendSummary(bars: KlineBar[]): string {
  const recent = bars.slice(-60)
  if (recent.length < 2) return 'K-line data not loaded.'
  const first = recent[0]
  const last = recent[recent.length - 1]
  const change = first.close ? last.close / first.close - 1 : 0
  const high = Math.max(...recent.map((b) => b.high))
  const low = Math.min(...recent.map((b) => b.low))
  return `Last ${recent.length} bars: close ${last.close}, change ${formatPercent(change)}, range ${low.toFixed(2)}-${high.toFixed(2)}.`
}

function technicalPromptSummary(setup: TechnicalSetup | null): string {
  if (!setup) return 'Technical setup: insufficient K-line data.'
  return [
    `Technical setup: ${setup.label}, score ${setup.score}/100. ${setup.summary}`,
    `Support: ${setup.support ? `${fmtPrice(setup.support.price)} (${formatPercent(-setup.support.distance)} below)` : 'n/a'}.`,
    `Resistance: ${setup.resistance ? `${fmtPrice(setup.resistance.price)} (${formatPercent(setup.resistance.distance)} above)` : 'n/a'}.`,
    `Moving averages: MA5 ${fmtPrice(setup.ma.ma5)}, MA10 ${fmtPrice(setup.ma.ma10)}, MA20 ${fmtPrice(setup.ma.ma20)}, MA50 ${fmtPrice(setup.ma.ma50)}, MA100 ${fmtPrice(setup.ma.ma100)}, MA200 ${fmtPrice(setup.ma.ma200)}.`,
    `EMA trend: EMA12 ${fmtPrice(setup.ema.ema12)}, EMA26 ${fmtPrice(setup.ema.ema26)}.`,
    `RSI: RSI6 ${setup.rsi.rsi6 === null ? 'n/a' : setup.rsi.rsi6.toFixed(1)}, RSI14 ${setup.rsi.rsi14 === null ? 'n/a' : setup.rsi.rsi14.toFixed(1)}, RSI24 ${setup.rsi.rsi24 === null ? 'n/a' : setup.rsi.rsi24.toFixed(1)}.`,
    `MACD: DIF ${fmtSigned(setup.macd.dif)}, DEA ${fmtSigned(setup.macd.dea)}, histogram ${fmtSigned(setup.macd.hist)}, previous histogram ${fmtSigned(setup.macd.prevHist)}.`,
    `Bollinger: upper ${fmtPrice(setup.boll.upper)}, middle ${fmtPrice(setup.boll.middle)}, lower ${fmtPrice(setup.boll.lower)}, bandwidth ${fmtPlainPercent(setup.boll.bandwidth)}, percentB ${setup.boll.percentB === null ? 'n/a' : setup.boll.percentB.toFixed(2)}.`,
    `Volatility/volume: ATR14 ${fmtPrice(setup.atr14)}, volume ${setup.volume.latest === null ? 'n/a' : formatCompact(setup.volume.latest)}, volume MA20 ${setup.volume.ma20 === null ? 'n/a' : formatCompact(setup.volume.ma20)}, volume ratio ${setup.volume.ratio === null ? 'n/a' : `${setup.volume.ratio.toFixed(2)}x`}.`,
    `Ranges: 20d ${fmtPrice(setup.range.low20)}-${fmtPrice(setup.range.high20)}, 60d ${fmtPrice(setup.range.low60)}-${fmtPrice(setup.range.high60)}, 120d ${fmtPrice(setup.range.low120)}-${fmtPrice(setup.range.high120)}.`,
    `52-week position: ${setup.position.from52wHigh === null ? 'n/a' : `${formatPercent(setup.position.from52wHigh)} from high`}, ${setup.position.from52wLow === null ? 'n/a' : `${formatPercent(setup.position.from52wLow)} from low`}.`,
    `Trigger: ${setup.trigger}. Invalidation: ${setup.invalidation}.`,
  ].join('\n')
}

function institutionalPromptSummary(
  context: InstitutionalContext | null | undefined,
  code: string,
): string {
  const metrics = context?.metrics
  if (!context?.available || !metrics) {
    return 'Institutional/fundamental context: not available yet; do not infer missing filing data.'
  }
  return [
    `Institutional/fundamental context from ${context.source}: ${context.companyName ?? context.symbol ?? code}.`,
    `Revenue TTM ${formatRevenueCompact(metrics.revenueTtm)}, net income TTM ${formatRevenueCompact(metrics.netIncomeTtm)}, free cash flow TTM ${formatRevenueCompact(metrics.freeCashFlowTtm)}.`,
    `Margins: net ${fmtOptionalPercent(metrics.netMarginTtm)}, operating ${fmtOptionalPercent(metrics.operatingMarginTtm)}, ROE ${fmtOptionalPercent(metrics.roeTtm)}.`,
    `Balance sheet: cash ${formatRevenueCompact(metrics.cash)}, liabilities/assets ${fmtOptionalPercent(metrics.liabilitiesToAssets)}.`,
    `Latest filing: ${context.periods?.latestFiled ?? 'n/a'}, balance sheet period ${context.periods?.latestBalanceSheetEnd ?? 'n/a'}.`,
  ].join('\n')
}

export interface AnalysisPromptInput {
  code: string
  quote: Quote | null
  bars: KlineBar[]
  setup: TechnicalSetup | null
  news: { provider: string; title: string }[]
  earnings: EarningsRecord | null
  institutional?: InstitutionalContext | null
}

export function buildAnalysisPrompt(input: AnalysisPromptInput): string {
  const q = input.quote
  const earnings = input.earnings
  const headlines = input.news.slice(0, 6).map((n) => `${n.provider}: ${n.title}`)
  return [
    `Symbol: ${q?.symbol ?? input.code} ${input.code}`,
    q
      ? `Quote: last ${q.last}, today ${formatChange(q.change)} (${formatPercent(q.changePct)}), open ${q.open}, high ${q.high}, low ${q.low}, volume ${q.volume}.`
      : 'Quote unavailable.',
    trendSummary(input.bars),
    technicalPromptSummary(input.setup),
    institutionalPromptSummary(input.institutional, input.code),
    earnings?.nextDate
      ? `Upcoming earnings: ${earnings.nextDate}, EPS est ${earnings.nextEpsEstimate ?? 'n/a'}, revenue est ${earnings.nextRevenueEstimate ?? 'n/a'}.`
      : 'Upcoming earnings: unknown.',
    `Headlines:\n${headlines.length ? headlines.join('\n') : 'No recent headlines loaded.'}`,
  ].join('\n\n')
}

// ── Content parsing ──────────────────────────────────────────────────────

export interface AnalysisSection {
  title: string
  body: string[]
}

export function sanitizeAnalysis(input: string): string {
  return input
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeSectionTitle(value: string): string {
  const title = value.trim()
  if (/^(行动结论|操作结论|结论|摘要|Action summary)$/i.test(title)) return '行动结论'
  if (/^(技术结构|技术面|趋势结构|Technical setup)$/i.test(title)) return '技术结构'
  if (/^(关键位置|支撑阻力|支撑\/阻力|Support\/Resistance)$/i.test(title)) return '关键位置'
  if (/^(动量波动|动量与波动|RSI\/MACD|Momentum)$/i.test(title)) return '动量波动'
  if (/^(量能确认|成交量|Volume)$/i.test(title)) return '量能确认'
  if (/^(基本面事件|基本面\/事件|新闻财报|新闻\/财报|Fundamental context)$/i.test(title)) return '基本面事件'
  if (/^(风险|风险点|Risks)$/i.test(title)) return '风险'
  if (/^(下一步|下一触发|Next trigger)$/i.test(title)) return '下一步'
  return title
}

export function parseAnalysisContent(input: string): { summary: string; sections: AnalysisSection[] } {
  const lines = input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const sections: AnalysisSection[] = []
  let summary = ''
  let current: AnalysisSection | null = null

  for (const line of lines) {
    const match = line.match(/^([^:：]{2,24})[:：]\s*(.*)$/)
    if (match) {
      const title = normalizeSectionTitle(match[1])
      const body = match[2]?.trim()
      if (title === '行动结论') {
        summary = body || line
        current = null
        continue
      }
      current = { title, body: body ? [body] : [] }
      sections.push(current)
      continue
    }

    if (!summary) {
      summary = line
      continue
    }
    if (!current) {
      current = { title: '分析', body: [] }
      sections.push(current)
    }
    current.body.push(line)
  }

  return {
    summary: summary || input,
    sections: sections.filter((section) => section.body.length > 0),
  }
}
