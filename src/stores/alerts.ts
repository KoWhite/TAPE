import { defineStore } from 'pinia'
import type { Quote } from '@/types/stock'

export type AlertType = 'priceAbove' | 'priceBelow' | 'changePctUp' | 'changePctDown'

export interface AlertRule {
  id: string
  code: string
  symbol: string
  type: AlertType
  /** Absolute price for priceAbove/Below; decimal pct (0.05 = +5%) for changePct*. */
  threshold: number
  enabled: boolean
  /** Fired once already — won't re-fire until manually reset. */
  triggered: boolean
  createdAt: string
  triggeredAt?: string
  /** Snapshot of the price that fired the rule. */
  triggeredAt_price?: number
}

const ALERT_LABELS: Record<AlertType, string> = {
  priceAbove: 'Price ≥',
  priceBelow: 'Price ≤',
  changePctUp: '% change ≥',
  changePctDown: '% change ≤',
}

export function describeAlert(rule: AlertRule): string {
  const label = ALERT_LABELS[rule.type]
  if (rule.type.startsWith('changePct')) {
    const sign = rule.threshold > 0 ? '+' : ''
    return `${label} ${sign}${(rule.threshold * 100).toFixed(2)}%`
  }
  return `${label} ${rule.threshold.toFixed(2)}`
}

function evaluate(rule: AlertRule, quote: Quote): boolean {
  switch (rule.type) {
    case 'priceAbove':
      return quote.last >= rule.threshold
    case 'priceBelow':
      return quote.last <= rule.threshold && quote.last > 0
    case 'changePctUp':
      return quote.changePct >= rule.threshold
    case 'changePctDown':
      return quote.changePct <= rule.threshold
  }
}

let permissionPromise: Promise<NotificationPermission> | null = null
function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return Promise.resolve('denied')
  if (Notification.permission !== 'default') return Promise.resolve(Notification.permission)
  if (!permissionPromise) permissionPromise = Notification.requestPermission()
  return permissionPromise
}

function fireNotification(rule: AlertRule, quote: Quote): void {
  const title = `${rule.symbol} alert`
  const body = `${describeAlert(rule)} · last ${quote.last.toFixed(2)}`
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, tag: rule.id })
    } catch {
      /* swallow — some browsers throw on background tabs */
    }
  }
}

export const useAlertsStore = defineStore(
  'alerts',
  () => {
    const rules = ref<AlertRule[]>([])

    function rulesFor(code: string): AlertRule[] {
      return rules.value.filter((r) => r.code === code)
    }

    function add(input: Omit<AlertRule, 'id' | 'enabled' | 'triggered' | 'createdAt'>): AlertRule {
      const rule: AlertRule = {
        ...input,
        id: `${input.code}:${input.type}:${input.threshold}:${Date.now()}`,
        enabled: true,
        triggered: false,
        createdAt: new Date().toISOString(),
      }
      rules.value.push(rule)
      void ensureNotificationPermission()
      return rule
    }

    function remove(id: string): void {
      rules.value = rules.value.filter((r) => r.id !== id)
    }

    function toggle(id: string): void {
      const r = rules.value.find((x) => x.id === id)
      if (!r) return
      r.enabled = !r.enabled
      // Re-arming a rule clears its triggered flag so it can fire again.
      if (r.enabled) {
        r.triggered = false
        r.triggeredAt = undefined
        r.triggeredAt_price = undefined
      }
    }

    function reset(id: string): void {
      const r = rules.value.find((x) => x.id === id)
      if (!r) return
      r.triggered = false
      r.triggeredAt = undefined
      r.triggeredAt_price = undefined
    }

    /** Walk every rule against the latest quote map; fire once per arm. */
    function check(quotes: Map<string, Quote>): void {
      for (const r of rules.value) {
        if (!r.enabled || r.triggered) continue
        const q = quotes.get(r.code)
        if (!q) continue
        if (evaluate(r, q)) {
          r.triggered = true
          r.triggeredAt = new Date().toISOString()
          r.triggeredAt_price = q.last
          fireNotification(r, q)
        }
      }
    }

    return { rules, rulesFor, add, remove, toggle, reset, check }
  },
  { persist: { key: 'tape:alerts' } },
)
