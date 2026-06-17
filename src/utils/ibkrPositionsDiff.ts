import type { IbkrPositionInput } from '@/stores/portfolio'

export type IbkrDiffKind = 'new' | 'increased' | 'reduced' | 'closed' | 'unchanged'

export interface IbkrDiffRow {
  code: string
  symbol: string
  kind: IbkrDiffKind
  /** Share count before / after. Closed → after 0; new → before 0. */
  before: number
  after: number
  /** after − before. Positive = added shares, negative = sold. */
  delta: number
}

export interface IbkrPositionsDiff {
  rows: IbkrDiffRow[]
  counts: Record<IbkrDiffKind, number>
}

/** Shares can carry tiny fractional dust from cost-basis math; treat
 *  sub-threshold moves as unchanged so a 0.0001-share rounding blip doesn't
 *  read as a trade. */
const EPSILON = 1e-4

function classify(before: number, after: number): IbkrDiffKind {
  if (before <= 0 && after > 0) return 'new'
  if (before > 0 && after <= 0) return 'closed'
  if (Math.abs(after - before) <= EPSILON) return 'unchanged'
  return after > before ? 'increased' : 'reduced'
}

/**
 * Compare the prior IBKR position snapshot against the one about to be
 * imported, by share count per symbol. Pure — both sides are plain position
 * lists, so the importer can preview "what changed" before the user commits
 * the wholesale replace. Cost-price changes alone are ignored; this diff is
 * about whether the holding grew, shrank, appeared, or went away.
 */
export function diffIbkrPositions(
  before: IbkrPositionInput[],
  after: IbkrPositionInput[],
): IbkrPositionsDiff {
  const beforeByCode = new Map(before.map((p) => [p.code, p]))
  const afterByCode = new Map(after.map((p) => [p.code, p]))
  const codes = new Set<string>([...beforeByCode.keys(), ...afterByCode.keys()])

  const rows: IbkrDiffRow[] = []
  const counts: Record<IbkrDiffKind, number> = {
    new: 0,
    increased: 0,
    reduced: 0,
    closed: 0,
    unchanged: 0,
  }

  for (const code of codes) {
    const b = beforeByCode.get(code)
    const a = afterByCode.get(code)
    const beforeShares = b?.shares ?? 0
    const afterShares = a?.shares ?? 0
    const kind = classify(beforeShares, afterShares)
    counts[kind] += 1
    rows.push({
      code,
      symbol: a?.symbol ?? b?.symbol ?? code,
      kind,
      before: beforeShares,
      after: afterShares,
      delta: afterShares - beforeShares,
    })
  }

  // Surface changes first (new → increased → reduced → closed), unchanged
  // last; within a kind, biggest absolute share move first.
  const order: Record<IbkrDiffKind, number> = {
    new: 0,
    increased: 1,
    reduced: 2,
    closed: 3,
    unchanged: 4,
  }
  rows.sort((x, y) => order[x.kind] - order[y.kind] || Math.abs(y.delta) - Math.abs(x.delta))

  return { rows, counts }
}
