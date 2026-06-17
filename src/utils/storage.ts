/**
 * Tiny localStorage wrapper with JSON encoding and namespace prefix.
 * Pinia handles persistence for stores; this is for ad-hoc widget state.
 */
const NS = 'tape:'

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(NS + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value))
  } catch {
    /* quota / private mode — silently ignore */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(NS + key)
  } catch {
    /* ignore */
  }
}
