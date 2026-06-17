import type { KType } from '@/types/kline'
import type { IndicatorMeta, IndicatorResult } from '@/types/indicator'

export interface IndicatorPeriod {
  id: KType
  label: string
  intraday: boolean
  count: number
}

export interface ActiveIndicatorInstance {
  indicatorId: string
  params: Record<string, number>
}

export interface IndicatorPaneView {
  inst: ActiveIndicatorInstance
  meta: IndicatorMeta | null
  result: IndicatorResult | null
  loading: boolean
}
