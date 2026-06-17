<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useIndicatorsStore } from '@/stores/indicators'
import { fetchBars } from '@/api/kline'
import type { KlineBar } from '@/types/kline'
import IndicatorLabHeader from './components/IndicatorLabHeader.vue'
import IndicatorLabControls from './components/IndicatorLabControls.vue'
import IndicatorPriceChart from './components/IndicatorPriceChart.vue'
import IndicatorStack from './components/IndicatorStack.vue'
import IndicatorPickerModal from './components/IndicatorPickerModal.vue'
import type { ActiveIndicatorInstance, IndicatorPaneView, IndicatorPeriod } from './types'

const PERIODS: IndicatorPeriod[] = [
  { id: 'K_DAY', label: 'D', intraday: false, count: 250 },
  { id: 'K_WEEK', label: 'W', intraday: false, count: 250 },
  { id: 'K_MON', label: 'M', intraday: false, count: 120 },
  { id: 'K_60M', label: '1H', intraday: true, count: 240 },
]

const { t } = useI18n()
const store = useIndicatorsStore()
const { catalog } = storeToRefs(store)

const code = ref('US.AAPL')
const codeInput = ref(code.value)
const period = ref<IndicatorPeriod>(PERIODS[0])

const bars = ref<KlineBar[]>([])
const barsLoading = ref(false)
const barsError = ref<string | null>(null)

const active = ref<ActiveIndicatorInstance[]>([
  { indicatorId: 'rsi', params: { window: 14 } },
  { indicatorId: 'macd', params: { fast: 12, slow: 26, signal: 9 } },
])

const activeIds = computed(() => active.value.map((a) => a.indicatorId))
const showPicker = ref(false)

async function loadBars(): Promise<void> {
  if (!code.value.trim()) return
  barsLoading.value = true
  barsError.value = null
  try {
    const res = await fetchBars({
      code: code.value.trim().toUpperCase(),
      ktype: period.value.id,
      count: period.value.count,
    })
    bars.value = res.bars
    if (!res.bars.length) {
      barsError.value = t('indicators.noBars', { code: code.value, period: period.value.label })
    }
  } catch (e) {
    barsError.value = (e as Error).message
    bars.value = []
  } finally {
    barsLoading.value = false
  }
}

function applyCode(): void {
  const next = codeInput.value.trim().toUpperCase()
  if (!next || next === code.value) return
  code.value = next.includes('.') ? next : `US.${next}`
  codeInput.value = code.value
}

function defaultParamsFor(id: string): Record<string, number> {
  const meta = catalog.value.find((m) => m.id === id)
  if (!meta) return {}
  const out: Record<string, number> = {}
  for (const p of meta.params) out[p.name] = p.default
  return out
}

function addIndicator(id: string): void {
  if (active.value.some((a) => a.indicatorId === id)) {
    showPicker.value = false
    return
  }
  active.value = [...active.value, { indicatorId: id, params: defaultParamsFor(id) }]
  showPicker.value = false
}

function removeIndicator(id: string): void {
  active.value = active.value.filter((a) => a.indicatorId !== id)
}

function updateParams(id: string, params: Record<string, number>): void {
  active.value = active.value.map((a) => (a.indicatorId === id ? { ...a, params } : a))
}

function ensureIndicators(force = false): void {
  for (const inst of active.value) {
    void store.ensure(
      {
        code: code.value,
        ktype: period.value.id,
        count: period.value.count,
        indicator: inst.indicatorId,
        params: inst.params,
      },
      force,
    )
  }
}

const panes = computed<IndicatorPaneView[]>(() =>
  active.value.map((inst) => {
    const req = {
      code: code.value,
      ktype: period.value.id,
      count: period.value.count,
      indicator: inst.indicatorId,
      params: inst.params,
    }
    return {
      inst,
      meta: store.meta(inst.indicatorId),
      result: store.get(req),
      loading: store.loadingFor(req),
    }
  }),
)

function refreshAll(): void {
  void loadBars()
  ensureIndicators(true)
}

onMounted(() => {
  void loadBars()
  void store.loadCatalog()
})
watch([code, period], () => void loadBars())
watch([code, period, active], () => ensureIndicators(), { immediate: true, deep: true })
</script>

<template>
  <div class="space-y-5">
    <IndicatorLabHeader :loading="barsLoading" @refresh="refreshAll" />
    <IndicatorLabControls
      v-model:code-input="codeInput"
      :periods="PERIODS"
      :period="period"
      :error="barsError"
      @apply-code="applyCode"
      @update:period="period = $event"
    />
    <IndicatorPriceChart
      :bars="bars"
      :intraday="period.intraday"
      :loading="barsLoading"
      :error="barsError"
    />
    <IndicatorStack
      :panes="panes"
      @remove="removeIndicator"
      @update-params="updateParams"
      @add="showPicker = true"
    />
    <IndicatorPickerModal
      v-if="showPicker"
      :selected="activeIds"
      @close="showPicker = false"
      @select="addIndicator"
    />
  </div>
</template>
