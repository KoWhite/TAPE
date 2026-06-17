import type { Component } from 'vue'
import IconSunrise from '~icons/lucide/sunrise'
import IconSun from '~icons/lucide/sun'
import IconSunset from '~icons/lucide/sunset'
import IconMoon from '~icons/lucide/moon'
import type { Quote, SessionKind } from '@/types/stock'

export type ActiveSessionKind = SessionKind | 'regular'

/** Get the current "active" trading session for a US-listed security based on
 *  US-Eastern wall-clock time. Roughly:
 *
 *   04:00–09:30 ET  → preMarket
 *   09:30–16:00 ET  → regular
 *   16:00–20:00 ET  → afterHours
 *   20:00–04:00 ET  → overnight
 *
 *  Doesn't account for weekends / holidays — caller falls back to the last
 *  available session price if the picked session has no data.
 */
export function currentUSSession(now: Date = new Date()): ActiveSessionKind {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  const m = hour * 60 + minute

  if (m >= 240 && m < 570) return 'preMarket'    //  04:00–09:30
  if (m >= 570 && m < 960) return 'regular'      //  09:30–16:00
  if (m >= 960 && m < 1200) return 'afterHours'  //  16:00–20:00
  return 'overnight'                             //  20:00–04:00
}

export interface ActiveSession {
  kind: ActiveSessionKind
  price: number
  change: number
  /** Decimal — 0.0123 = +1.23% */
  changePct: number
  /** True when we fell back because the preferred session had no data. */
  fallback: boolean
}

/** Pick the session to display for a quote.
 *
 *  US: time-based current session, fall back to `last/change` (RTH) when the
 *      time-of-day session has no data.
 *  Non-US: always RTH.
 */
export function pickActiveSession(
  quote: Quote,
  now: Date = new Date(),
): ActiveSession {
  const regular: ActiveSession = {
    kind: 'regular',
    price: quote.last,
    change: quote.change,
    changePct: quote.changePct,
    fallback: false,
  }
  if (quote.market !== 'US') return regular

  const target = currentUSSession(now)
  if (target === 'regular') return regular

  const block = quote.sessions?.[target]
  if (block && block.price > 0) {
    return {
      kind: target,
      price: block.price,
      change: block.change,
      changePct: block.changePct,
      fallback: false,
    }
  }
  return { ...regular, fallback: true }
}

export const SESSION_META: Record<
  ActiveSessionKind,
  { label: string; shortLabel: string; icon: Component }
> = {
  preMarket: { label: 'Pre-market', shortLabel: 'Pre', icon: IconSunrise },
  regular: { label: 'Regular hours', shortLabel: 'RTH', icon: IconSun },
  afterHours: { label: 'After-hours', shortLabel: 'After', icon: IconSunset },
  overnight: { label: 'Overnight', shortLabel: 'Overnight', icon: IconMoon },
}
