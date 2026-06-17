import type { KType } from '@/types/kline'
import type { AlertType } from '@/stores/alerts'

export interface StockPeriod {
  id: KType
  label: string
  intraday: boolean
  count: number
}

export interface StockIndicators {
  boll: boolean
  rsi: boolean
  macd: boolean
}

export interface StockAlertForm {
  type: AlertType
  threshold: string
}
