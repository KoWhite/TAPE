<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { debounce } from 'lodash-es'
import { getProvider } from '@/api'
import { useWatchlistStore } from '@/stores/watchlist'
import { PopoverClose } from 'reka-ui'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

const props = defineProps<{
  /** Currently active category tab on the Dashboard. Used as the default
   *  category for newly added symbols so adding from inside the "AI" tab
   *  drops the new symbol straight into AI. */
  activeCategoryId?: string | null
}>()

const { t } = useI18n()
const watchlist = useWatchlistStore()

const newSymbol = ref('')
const search = ref<{ code: string; symbol: string; name: string }[]>([])
const searching = ref(false)
const dragIndex = ref<number | null>(null)

/** Category the next add will land in. Empty string = uncategorized.
 *  Seeded from the active tab so the common flow ("I'm in AI, I want to
 *  add NVDA to AI") needs zero extra clicks. The user can still override
 *  before pressing Add. */
const targetCategoryId = ref<string>(
  props.activeCategoryId && props.activeCategoryId !== '__none__'
    ? props.activeCategoryId
    : '',
)

watch(
  () => props.activeCategoryId,
  (next) => {
    targetCategoryId.value = next && next !== '__none__' ? next : ''
  },
)

const runSearch = debounce(async (q: string) => {
  try {
    search.value = await getProvider().searchSymbols(q)
  } finally {
    searching.value = false
  }
}, 300)

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
  const categoryId = targetCategoryId.value || undefined
  if (watchlist.add({ symbol: item.symbol, code: item.code, name: item.name, categoryId })) {
    newSymbol.value = ''
    search.value = []
  }
}

function addManual(): void {
  const raw = newSymbol.value.trim()
  if (!raw) return
  const categoryId = targetCategoryId.value || undefined
  if (watchlist.add({ symbol: raw, categoryId })) {
    newSymbol.value = ''
    search.value = []
  }
}

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
  <div class="inline-flex">
    <Popover>
      <PopoverTrigger as-child>
        <button class="btn-primary h-8 px-2 sm:px-3 text-xs" :title="t('watchlist.manager.addOrManage')">
          <IconLucidePlus class="size-3.5" />
          <span class="hidden sm:inline">{{ t('watchlist.manager.add') }}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        :side-offset="8"
        class="w-[min(560px,calc(100vw-24px))] max-h-[min(76vh,640px)] overflow-auto bg-[var(--tape-surface)] border-[var(--tape-border)] text-[var(--tape-text)] p-0 shadow-2xl shadow-[rgba(11,15,23,0.22)]"
      >
        <section class="space-y-4 p-4">
          <header class="flex-between gap-3 flex-wrap">
            <div>
              <h3 class="text-sm font-semibold tracking-tight flex items-center gap-2">
                <IconLucideBookmarkPlus class="size-4 text-[var(--tape-accent)]" />
                {{ t('watchlist.manager.title') }}
              </h3>
              <p class="text-xs text-muted mt-0.5">
                {{ t('watchlist.manager.subtitle', { count: watchlist.items.length }) }}
              </p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button class="btn-ghost h-8 px-2 sm:px-3 text-xs" @click="watchlist.reset()">
                <IconLucideRotateCcw class="size-3.5" />
                {{ t('watchlist.manager.reset') }}
              </button>
              <PopoverClose
                class="size-8 rounded-md flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)] transition-colors"
                :aria-label="t('watchlist.manager.close')"
              >
                <IconLucideX class="size-4" />
              </PopoverClose>
            </div>
          </header>

          <div class="relative">
            <div class="flex flex-col xs:flex-row gap-2">
              <div class="relative flex-1 min-w-0">
                <input
                  v-model="newSymbol"
                  class="input-base pl-9 uppercase"
                  placeholder="AAPL, US.AAPL, HK.00700"
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
              <div class="flex gap-2 shrink-0">
                <select
                  v-model="targetCategoryId"
                  class="h-10 px-2 rounded-md bg-[var(--tape-input)] border border-[var(--tape-border)] text-sm focus:border-[var(--tape-accent)] outline-none cursor-pointer flex-1 xs:flex-none xs:w-36"
                  :title="t('watchlist.manager.categoryForNew')"
                >
                  <option value="">{{ t('watchlist.manager.uncategorized') }}</option>
                  <option v-for="c in watchlist.categories" :key="c.id" :value="c.id">
                    {{ c.name }}
                  </option>
                </select>
                <button class="btn-primary h-10 shrink-0" @click="addManual">
                  <IconLucidePlus class="size-4" />
                  {{ t('watchlist.manager.add') }}
                </button>
              </div>
            </div>

            <ul
              v-if="search.length"
              class="absolute z-20 left-0 right-0 mt-1.5 surface shadow-2xl shadow-[rgba(11,15,23,0.24)] max-h-64 overflow-auto p-1"
            >
              <li v-for="item in search" :key="item.code">
                <button
                  class="w-full flex-between gap-3 px-3 py-2 rounded-md bg-[var(--tape-button-bg)] text-left hover:bg-[var(--tape-button-hover-bg)] text-sm transition-colors"
                  :disabled="watchlist.has(item.symbol)"
                  :class="{ 'opacity-40': watchlist.has(item.symbol) }"
                  @click="addFromSearch(item)"
                >
                  <span class="flex flex-col min-w-0">
                    <span class="font-semibold">{{ item.symbol }}</span>
                    <span class="text-xs text-muted truncate">{{ item.name }}</span>
                  </span>
                  <span class="text-xs text-soft">
                    {{ watchlist.has(item.symbol) ? t('watchlist.manager.added') : item.code }}
                  </span>
                </button>
              </li>
            </ul>
          </div>

          <ul
            v-if="watchlist.items.length"
            class="max-h-[420px] overflow-auto divide-y divide-[var(--tape-border)] border border-[var(--tape-border)] rounded-lg"
          >
            <li
              v-for="(item, i) in watchlist.items"
              :key="item.code"
              class="flex-between gap-3 px-3 py-2.5 hover:bg-[var(--tape-surface-hover-bg)] transition-colors cursor-move"
              draggable="true"
              @dragstart="onDragStart(i, $event)"
              @dragover="onDragOver"
              @drop="onDrop(i)"
            >
              <div class="flex items-center gap-3 min-w-0">
                <IconLucideGripVertical class="size-4 text-soft shrink-0" />
                <span class="text-mono text-xs w-5 text-soft">{{ i + 1 }}</span>
                <div class="min-w-0">
                  <div class="text-sm font-semibold">{{ item.symbol }}</div>
                  <div class="text-xs text-muted truncate">{{ item.name ?? item.code }}</div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <select
                  :value="item.categoryId ?? ''"
                  class="text-xs h-8 w-24 sm:w-32 px-2 rounded-md bg-[var(--tape-input)] border border-[var(--tape-border)] focus:border-[var(--tape-accent)] outline-none cursor-pointer"
                  :title="t('watchlist.manager.categoryFor', { symbol: item.symbol })"
                  @click.stop
                  @change="watchlist.assignCategory(item.symbol, ($event.target as HTMLSelectElement).value || null)"
                >
                  <option value="">{{ t('watchlist.manager.uncategorized') }}</option>
                  <option v-for="c in watchlist.categories" :key="c.id" :value="c.id">
                    {{ c.name }}
                  </option>
                </select>
                <button
                  class="size-8 rounded-md flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-down)] hover:bg-[var(--tape-down-soft)] transition-colors"
                  :title="t('watchlist.manager.remove', { symbol: item.symbol })"
                  @click="watchlist.remove(item.symbol)"
                >
                  <IconLucideTrash2 class="size-3.5" />
                </button>
              </div>
            </li>
          </ul>
        </section>
      </PopoverContent>
    </Popover>
  </div>
</template>
