import type { KType } from '@/types/kline'

export interface ComparePeriod {
  id: string
  label: string
  ktype: KType
  count: number
}

export interface CompareRankedItem {
  code: string
  symbol: string
  color: string
  ret: number
  loaded: boolean
  error?: string
}
