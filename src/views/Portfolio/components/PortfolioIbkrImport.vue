<script setup lang="ts">
import { computed, ref } from 'vue'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import IconFileSpreadsheet from '~icons/lucide/file-spreadsheet'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import IconUpload from '~icons/lucide/upload'
import IconX from '~icons/lucide/x'
import { usePortfolioStore, type IbkrPositionInput } from '@/stores/portfolio'
import { formatPrice } from '@/utils/format'
import { parseIbkrPositions } from '@/utils/ibkrPositions'
import { diffIbkrPositions, type IbkrDiffKind } from '@/utils/ibkrPositionsDiff'

const portfolio = usePortfolioStore()

const fileName = ref('')
const positions = ref<IbkrPositionInput[]>([])
/** The IBKR holdings as they were when this file was loaded — frozen so the
 *  diff preview stays put after we apply the replace (which mutates the
 *  store's live snapshot). */
const baseline = ref<IbkrPositionInput[]>([])
const warnings = ref<string[]>([])
const error = ref<string | null>(null)
const importResult = ref<{ positions: number } | null>(null)
const loading = ref(false)

/** Preview of what this snapshot changes vs the holdings from the last IBKR
 *  import. Recomputes as soon as a file is parsed; cleared on reset. */
const diff = computed(() => {
  if (!positions.value.length) return null
  return diffIbkrPositions(baseline.value, positions.value)
})

const hasPriorSnapshot = computed(() => baseline.value.length > 0)

/** Only the kinds worth calling out, in display order. */
const DIFF_TILES: { kind: IbkrDiffKind; label: string; cls: string }[] = [
  { kind: 'new', label: 'New', cls: 'text-[var(--tape-up)]' },
  { kind: 'increased', label: 'Added', cls: 'text-[var(--tape-up)]' },
  { kind: 'reduced', label: 'Reduced', cls: 'text-[var(--tape-warn)]' },
  { kind: 'closed', label: 'Closed', cls: 'text-[var(--tape-down)]' },
]

const changedRows = computed(() => diff.value?.rows.filter((r) => r.kind !== 'unchanged') ?? [])

function reset(): void {
  fileName.value = ''
  positions.value = []
  baseline.value = []
  warnings.value = []
  error.value = null
  importResult.value = null
}

async function loadFile(file: File): Promise<void> {
  loading.value = true
  importResult.value = null
  error.value = null
  try {
    const text = await file.text()
    const result = parseIbkrPositions(text)
    fileName.value = file.name
    positions.value = result.positions
    baseline.value = portfolio.ibkrPositionsSnapshot()
    warnings.value = result.warnings
    if (!result.positions.length) {
      error.value = 'No open positions found. Export the IBKR Activity Statement as CSV and make sure the Open Positions section is included.'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not read this CSV file.'
  } finally {
    loading.value = false
  }
}

function handleFileInput(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) void loadFile(file)
  input.value = ''
}

function confirmReplace(): void {
  if (!positions.value.length) return
  importResult.value = portfolio.replaceFromIbkr(positions.value)
}
</script>

<template>
  <article class="surface overflow-hidden">
    <header class="px-4 py-3 border-b border-[var(--tape-border)] flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2 min-w-0">
        <IconFileSpreadsheet class="size-4 text-[var(--tape-accent)] shrink-0" />
        <div class="min-w-0">
          <h3 class="font-semibold tracking-tight">IBKR Position Sync</h3>
          <p class="text-xs text-muted truncate">
            Upload an Activity Statement CSV — replaces your IBKR holdings with this snapshot.
          </p>
        </div>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <label
          class="btn-ghost h-8 px-3 text-xs cursor-pointer"
          :class="loading ? 'opacity-70 pointer-events-none' : ''"
          title="Choose an IBKR Activity Statement CSV file"
        >
          <IconUpload class="size-3.5" />
          {{ loading ? 'Reading' : 'Choose CSV' }}
          <input class="sr-only" type="file" accept=".csv,text/csv" @change="handleFileInput" />
        </label>
        <button
          v-if="positions.length || error"
          class="size-8 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]"
          title="Clear preview"
          @click="reset"
        >
          <IconX class="size-3.5" />
        </button>
      </div>
    </header>

    <div v-if="!positions.length && !error" class="px-4 py-5 text-sm text-muted">
      Each import overwrites your previous IBKR positions with the latest statement. Manually-entered trades are left untouched.
    </div>

    <div v-else class="p-4 space-y-4">
      <div v-if="error" class="rounded-lg border border-[var(--tape-down-soft)] bg-[var(--tape-down-soft)] px-3 py-2 text-sm text-[var(--tape-down)]">
        {{ error }}
      </div>

      <div v-if="positions.length" class="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div class="rounded-lg bg-[var(--tape-button-bg)] px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-soft">File</div>
          <div class="text-xs font-medium truncate mt-0.5">{{ fileName }}</div>
        </div>
        <div class="rounded-lg bg-[var(--tape-button-bg)] px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-soft">Positions</div>
          <div class="text-mono text-lg font-semibold mt-0.5">{{ positions.length }}</div>
        </div>
        <div class="rounded-lg bg-[var(--tape-button-bg)] px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-soft">Notes</div>
          <div class="text-mono text-lg font-semibold mt-0.5">{{ warnings.length }}</div>
        </div>
      </div>

      <div v-if="warnings.length" class="rounded-lg border border-[var(--tape-border)] bg-[var(--tape-button-bg)] px-3 py-2">
        <div class="flex items-center gap-2 text-xs font-medium text-[var(--tape-warn)]">
          <IconTriangleAlert class="size-3.5" />
          {{ warnings.length }} parser notes
        </div>
        <ul class="mt-1 max-h-20 overflow-y-auto text-xs text-muted space-y-0.5">
          <li v-for="warning in warnings.slice(0, 6)" :key="warning">{{ warning }}</li>
        </ul>
      </div>

      <div v-if="diff && hasPriorSnapshot" class="rounded-lg border border-[var(--tape-border)] bg-[var(--tape-button-bg)] px-3 py-2.5 space-y-2">
        <div class="text-[10px] uppercase tracking-wider text-soft">Changes vs last import</div>
        <div class="grid grid-cols-4 gap-2">
          <div v-for="tile in DIFF_TILES" :key="tile.kind">
            <div class="text-[10px] uppercase tracking-wider text-soft">{{ tile.label }}</div>
            <div class="text-mono text-lg font-semibold" :class="diff.counts[tile.kind] ? tile.cls : 'text-soft'">
              {{ diff.counts[tile.kind] }}
            </div>
          </div>
        </div>
        <p v-if="!changedRows.length" class="text-xs text-muted">
          No position changes — same holdings as your last import.
        </p>
        <ul v-else class="max-h-32 overflow-y-auto space-y-0.5 text-xs">
          <li
            v-for="row in changedRows"
            :key="row.code"
            class="flex items-center justify-between gap-3 text-mono"
          >
            <span class="font-medium">{{ row.symbol }}</span>
            <span
              :class="row.kind === 'closed' ? 'text-[var(--tape-down)]' : row.kind === 'reduced' ? 'text-[var(--tape-warn)]' : 'text-[var(--tape-up)]'"
            >
              <template v-if="row.kind === 'new'">new · {{ row.after }} sh</template>
              <template v-else-if="row.kind === 'closed'">closed · was {{ row.before }} sh</template>
              <template v-else>{{ row.before }} → {{ row.after }} sh ({{ row.delta > 0 ? '+' : '' }}{{ row.delta }})</template>
            </span>
          </li>
        </ul>
      </div>

      <div v-if="positions.length" class="overflow-x-auto rounded-lg border border-[var(--tape-border)]">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-[10px] uppercase tracking-wider text-soft border-b border-[var(--tape-border)]">
              <th class="text-left font-medium px-3 py-2">Symbol</th>
              <th class="text-right font-medium px-3 py-2">Shares</th>
              <th class="text-right font-medium px-3 py-2">Cost Price</th>
              <th class="text-right font-medium px-3 py-2">Cost Basis</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="pos in positions"
              :key="pos.code"
              class="border-b border-[var(--tape-border)] last:border-b-0"
            >
              <td class="px-3 py-2">
                <div class="font-medium">{{ pos.symbol }}</div>
                <div class="text-[10px] text-soft">{{ pos.code }}</div>
              </td>
              <td class="px-3 py-2 text-right text-mono">{{ pos.shares }}</td>
              <td class="px-3 py-2 text-right text-mono">{{ formatPrice(pos.costPrice) }}</td>
              <td class="px-3 py-2 text-right text-mono text-soft">{{ formatPrice(pos.shares * pos.costPrice) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="positions.length" class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs text-muted">
          Replaces all previously-imported IBKR positions. Manual trades stay as-is.
        </p>
        <div class="flex items-center gap-2">
          <span v-if="importResult" class="text-xs text-[var(--tape-accent)]">
            Synced {{ importResult.positions }} positions.
          </span>
          <button
            class="btn-primary h-8 px-3 text-xs"
            :disabled="!positions.length"
            title="Replace IBKR holdings with this snapshot"
            @click="confirmReplace"
          >
            <IconRefreshCw class="size-3.5" />
            Replace holdings
          </button>
        </div>
      </div>
    </div>
  </article>
</template>
