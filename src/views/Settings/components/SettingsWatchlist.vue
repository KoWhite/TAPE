<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { debounce } from 'lodash-es'
import { getProvider } from '@/api'
import { useWatchlistStore } from '@/stores/watchlist'

const watchlist = useWatchlistStore()

const newSymbol = ref('')
const search = ref<{ code: string; symbol: string; name: string }[]>([])
const searching = ref(false)

const SEARCH_DEBOUNCE_MS = 300

const runSearch = debounce(async (q: string) => {
  try {
    search.value = await getProvider().searchSymbols(q)
  } finally {
    searching.value = false
  }
}, SEARCH_DEBOUNCE_MS)

watch(newSymbol, (q) => {
  const trimmed = q.trim()
  if (!trimmed) {
    runSearch.cancel()
    search.value = []
    searching.value = false
    return
  }
  searching.value = true
  runSearch(trimmed)
})

onUnmounted(() => runSearch.cancel())

function addFromSearch(item: { code: string; symbol: string; name: string }): void {
  if (watchlist.add({ symbol: item.symbol, name: item.name })) {
    newSymbol.value = ''
    search.value = []
  }
}

function addManual(): void {
  if (!newSymbol.value.trim()) return
  if (watchlist.add({ symbol: newSymbol.value })) {
    newSymbol.value = ''
    search.value = []
  }
}

const dragIndex = ref<number | null>(null)

function onDragStart(i: number, ev: DragEvent): void {
  dragIndex.value = i
  ev.dataTransfer?.setData('text/plain', String(i))
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'
}

function onDragOver(ev: DragEvent): void {
  ev.preventDefault()
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
}

function onDrop(i: number): void {
  if (dragIndex.value === null) return
  watchlist.move(dragIndex.value, i)
  dragIndex.value = null
}
</script>

<template>
  <section class="surface p-5 sm:p-6 space-y-5">
    <header class="flex-between gap-3">
      <div>
        <h3 class="font-semibold tracking-tight flex items-center gap-2">
          <IconLucideBookmark class="size-4 text-[var(--tape-accent)]" />
          Watchlist
        </h3>
        <p class="text-xs text-muted mt-0.5">
          {{ watchlist.items.length }} symbols. Drag to reorder.
        </p>
      </div>
      <button class="btn-ghost h-8 px-3 text-xs" @click="watchlist.reset()">
        <IconLucideRotateCcw class="size-3.5" />
        Reset to defaults
      </button>
    </header>

    <div class="relative">
      <div class="flex gap-2">
        <div class="relative flex-1">
          <input
            v-model="newSymbol"
            class="input-base pl-9 uppercase"
            placeholder="Add ticker symbol -e.g. AAPL, NVDA, SPY"
            maxlength="10"
            autocomplete="off"
            @keydown.enter="addManual"
          />
          <IconLucideSearch
            class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-soft"
          />
          <IconSvgSpinners180RingWithBg
            v-if="searching"
            class="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-soft"
          />
        </div>
        <button class="btn-primary" @click="addManual">
          <IconLucidePlus class="size-4" />
          Add
        </button>
      </div>

      <ul
        v-if="search.length"
        class="absolute z-20 left-0 right-0 mt-1.5 surface shadow-2xl shadow-black/40 max-h-64 overflow-auto p-1"
      >
        <li v-for="item in search" :key="item.code">
          <button
            class="w-full flex-between gap-3 px-3 py-2 rounded-lg bg-[var(--tape-button-bg)] text-left hover:bg-[var(--tape-button-hover-bg)] text-sm transition-colors"
            :disabled="watchlist.has(item.symbol)"
            :class="{ 'opacity-40': watchlist.has(item.symbol) }"
            @click="addFromSearch(item)"
          >
            <span class="flex flex-col min-w-0">
              <span class="font-semibold">{{ item.symbol }}</span>
              <span class="text-xs text-muted truncate">{{ item.name }}</span>
            </span>
            <span class="text-xs text-soft">
              {{ watchlist.has(item.symbol) ? 'Added' : item.code }}
            </span>
          </button>
        </li>
      </ul>
    </div>

    <ul
      v-if="watchlist.items.length"
      class="divide-y divide-[var(--tape-border)] border border-[var(--tape-border)] rounded-xl overflow-hidden"
    >
      <li
        v-for="(t, i) in watchlist.items"
        :key="t.code"
        class="flex-between gap-3 px-4 py-2.5 hover:bg-[var(--tape-surface-hover-bg)] transition-colors cursor-move"
        draggable="true"
        @dragstart="onDragStart(i, $event)"
        @dragover="onDragOver"
        @drop="onDrop(i)"
      >
        <div class="flex items-center gap-3 min-w-0">
          <IconLucideGripVertical class="size-4 text-soft shrink-0" />
          <span class="text-mono text-sm w-6 text-soft">{{ i + 1 }}</span>
          <div class="min-w-0">
            <div class="text-sm font-semibold">{{ t.symbol }}</div>
            <div class="text-xs text-muted truncate">
              {{ t.name ?? t.code }}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <select
            :value="t.categoryId ?? ''"
            class="text-xs h-8 px-2 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] focus:border-[var(--tape-accent)] outline-none cursor-pointer"
            :title="`Category for ${t.symbol}`"
            @click.stop
            @change="watchlist.assignCategory(t.symbol, ($event.target as HTMLSelectElement).value || null)"
          >
            <option value="">-Uncategorized</option>
            <option v-for="c in watchlist.categories" :key="c.id" :value="c.id">
              {{ c.name }}
            </option>
          </select>
          <span class="pill border border-[var(--tape-border)] text-soft">
            {{ t.market }} - {{ t.type }}
          </span>
          <button
            class="size-8 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-down)] hover:bg-[var(--tape-down-soft)] transition-colors"
            :title="`Remove ${t.symbol}`"
            @click="watchlist.remove(t.symbol)"
          >
            <IconLucideTrash2 class="size-3.5" />
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
