import { defineStore } from 'pinia'
import type { BacktestRequest } from '@/types/backtest'

export interface BacktestPreset {
  id: string
  name: string
  request: BacktestRequest
  createdAt: string
  updatedAt: string
}

function cloneRequest(request: BacktestRequest): BacktestRequest {
  return JSON.parse(JSON.stringify(request)) as BacktestRequest
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `preset:${Date.now()}:${Math.random().toString(16).slice(2)}`
}

export const useBacktestPresetsStore = defineStore(
  'backtestPresets',
  () => {
    const presets = ref<BacktestPreset[]>([])

    function save(name: string, request: BacktestRequest): BacktestPreset {
      const trimmed = name.trim() || `${request.universe[0] ?? 'Strategy'} ${request.strategyId}`
      const now = new Date().toISOString()
      const existing = presets.value.find((p) => p.name.toLowerCase() === trimmed.toLowerCase())
      if (existing) {
        existing.request = cloneRequest(request)
        existing.updatedAt = now
        return existing
      }
      const preset: BacktestPreset = {
        id: makeId(),
        name: trimmed,
        request: cloneRequest(request),
        createdAt: now,
        updatedAt: now,
      }
      presets.value.unshift(preset)
      return preset
    }

    function remove(id: string): void {
      presets.value = presets.value.filter((p) => p.id !== id)
    }

    return { presets, save, remove }
  },
  {
    persist: { key: 'tape:backtest-presets' },
  },
)
