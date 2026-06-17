/**
 * Bridge between our CSS-variable design tokens and ECharts option fragments.
 *
 * Reads computed values off `<html>` so the same call returns light or dark
 * tokens depending on the active class -pair with `useECharts`, which
 * re-runs the option builder whenever the theme class flips.
 */

export interface ThemeTokens {
  text: string
  textMuted: string
  textSoft: string
  border: string
  borderHover: string
  surface: string
  bgElev: string
  up: string
  down: string
  accent: string
}

const VAR_NAMES: Record<keyof ThemeTokens, string> = {
  text: '--tape-text',
  textMuted: '--tape-text-muted',
  textSoft: '--tape-text-soft',
  border: '--tape-border',
  borderHover: '--tape-border-hover',
  surface: '--tape-surface',
  bgElev: '--tape-bg-elev',
  up: '--tape-up',
  down: '--tape-down',
  accent: '--tape-accent',
}

export function getThemeTokens(el: Element = document.documentElement): ThemeTokens {
  const cs = getComputedStyle(el)
  const out = {} as ThemeTokens
  for (const k in VAR_NAMES) {
    const key = k as keyof ThemeTokens
    out[key] = cs.getPropertyValue(VAR_NAMES[key]).trim()
  }
  return out
}

/** Return the CSS color with the requested alpha. Accepts #rgb, #rrggbb, rgb(), rgba(). */
export function withAlpha(color: string, alpha: number): string {
  const c = color.trim()
  if (!c) return c
  if (c.startsWith('rgba(')) {
    return c.replace(/,\s*[\d.]+\s*\)$/, `, ${alpha})`)
  }
  if (c.startsWith('rgb(')) {
    return c.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`)
  }
  if (c.startsWith('#')) {
    const hex = c.slice(1)
    const full = hex.length === 3 ? hex.split('').map((h) => h + h).join('') : hex
    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return c
}

export const MONO_FONT = "JetBrains Mono, ui-monospace, SFMono-Regular, Consolas, monospace"
