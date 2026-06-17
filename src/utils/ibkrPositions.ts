import type { IbkrPositionInput } from '@/stores/portfolio'

export interface IbkrPositionsResult {
  positions: IbkrPositionInput[]
  warnings: string[]
}

type CsvRecord = Record<string, string>

/** Section IBKR uses for the open-position snapshot. */
const SECTION_POSITIONS = 'open positions'

function clean(value: string | undefined): string {
  return (value ?? '').replace(/^﻿/, '').trim()
}

function key(value: string | undefined): string {
  return clean(value).toLowerCase()
}

/** Read the first non-empty value among candidate column names, matching
 *  case-insensitively so minor header variations across IBKR exports work. */
function read(record: CsvRecord, names: string[]): string {
  for (const name of names) {
    const exact = record[name]
    if (exact != null && clean(exact) !== '') return clean(exact)
    const found = Object.entries(record).find(([k]) => key(k) === key(name))
    if (found && clean(found[1]) !== '') return clean(found[1])
  }
  return ''
}

/** Tolerant numeric parse: strips $ , % and turns accounting (123) into -123. */
function parseNumber(value: string): number {
  const cleaned = clean(value)
    .replace(/^\((.*)\)$/, '-$1')
    .replace(/[$%]/g, '')
    .replace(/,/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

function normalizeSymbol(value: string): string {
  const raw = clean(value).toUpperCase()
  if (!raw) return ''
  const first = raw.split(/\s+/)[0]
  return first.replace(/[^A-Z0-9.-]/g, '')
}

/** RFC-style CSV split tolerant of quotes, escaped "" and \r\n. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]
    if (quoted) {
      if (ch === '"' && next === '"') {
        field += '"'
        i += 1
      } else if (ch === '"') {
        quoted = false
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => clean(cell) !== ''))
}

function mapRecord(headers: string[], values: string[]): CsvRecord {
  return headers.reduce<CsvRecord>((acc, header, index) => {
    acc[clean(header)] = clean(values[index])
    return acc
  }, {})
}

/** Per-share cost. IBKR gives 'Cost Price' directly; if absent, derive it
 *  from total 'Cost Basis' / quantity. */
function costPriceOf(record: CsvRecord, shares: number): number {
  const direct = parseNumber(read(record, ['Cost Price', 'CostPrice', 'Average Cost']))
  if (direct > 0) return direct
  const basis = parseNumber(read(record, ['Cost Basis', 'CostBasis']))
  if (basis > 0 && shares > 0) return basis / shares
  return 0
}

function parsePosition(record: CsvRecord, warnings: string[]): IbkrPositionInput | null {
  const assetCategory = read(record, ['Asset Category'])
  if (assetCategory && !/stock|etf/i.test(assetCategory)) return null

  const symbol = normalizeSymbol(read(record, ['Symbol', 'Underlying Symbol']))
  const shares = parseNumber(read(record, ['Quantity', 'Qty']))
  const costPrice = costPriceOf(record, Math.abs(shares))

  if (!symbol || !shares || costPrice <= 0) {
    warnings.push(`Skipped position row: ${symbol || 'missing symbol'}${shares ? '' : ' (no quantity)'}`)
    return null
  }
  // A short position has no meaning in this long-only book — skip it.
  if (shares < 0) {
    warnings.push(`Skipped short position: ${symbol}`)
    return null
  }

  return {
    code: `US.${symbol}`,
    symbol,
    shares,
    costPrice,
  }
}

/**
 * Parse the Open Positions snapshot out of an IBKR Activity Statement CSV.
 * Returns one row per long US stock/ETF holding; everything else is ignored.
 * No dedup — the caller wholesale-replaces the IBKR ledger with this set.
 */
export function parseIbkrPositions(text: string): IbkrPositionsResult {
  const warnings: string[] = []
  const positions: IbkrPositionInput[] = []
  const headersBySection = new Map<string, string[]>()
  // IBKR lists the same symbol once per lot under DataDiscriminator='Lot';
  // we only want the 'Summary' (or lot-less) row, so collapse by symbol.
  const seen = new Set<string>()

  for (const row of parseCsv(text)) {
    const section = key(row[0])
    const rowType = key(row[1])
    if (section !== SECTION_POSITIONS || !rowType) continue

    if (rowType === 'header') {
      headersBySection.set(section, row.slice(2))
      continue
    }
    if (rowType !== 'data') continue

    const headers = headersBySection.get(section)
    if (!headers) continue

    const record = mapRecord(headers, row.slice(2))
    const discriminator = key(read(record, ['DataDiscriminator']))
    // Skip per-lot detail rows; keep only the summary line per symbol.
    if (discriminator === 'lot') continue

    const pos = parsePosition(record, warnings)
    if (!pos) continue
    if (seen.has(pos.code)) continue
    seen.add(pos.code)
    positions.push(pos)
  }

  return { positions, warnings }
}
