<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import IconBell from '~icons/lucide/bell'
import IconBellOff from '~icons/lucide/bell-off'
import IconTrash2 from '~icons/lucide/trash-2'
import IconRotateCcw from '~icons/lucide/rotate-ccw'
import IconCheck from '~icons/lucide/check'
import { useAlertsStore, describeAlert, type AlertType } from '@/stores/alerts'
import { useQuotesStore } from '@/stores/quotes'
import { useQuotes } from '@/composables/useQuotes'
import { formatRelative } from '@/utils/format'

const { t } = useI18n()
const alerts = useAlertsStore()
const { rules } = storeToRefs(alerts)

useQuotes()
const quotesStore = useQuotesStore()
const { quotes } = storeToRefs(quotesStore)

const router = useRouter()

const ordered = computed(() => {
  return [...rules.value].sort((a, b) => {
    if (a.triggered !== b.triggered) return a.triggered ? -1 : 1
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    return a.createdAt < b.createdAt ? 1 : -1
  })
})

const permission = ref<NotificationPermission>('default')
onMounted(() => {
  if (typeof Notification !== 'undefined') permission.value = Notification.permission
})

async function requestPermission(): Promise<void> {
  if (typeof Notification === 'undefined') return
  permission.value = await Notification.requestPermission()
}

const TYPE_LABEL = computed<Record<AlertType, string>>(() => ({
  priceAbove: t('alerts.type.above'),
  priceBelow: t('alerts.type.below'),
  changePctUp: t('alerts.type.upBy'),
  changePctDown: t('alerts.type.downBy'),
}))

function openDetail(code: string): void {
  router.push(`/stock/${encodeURIComponent(code)}`)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex-between flex-wrap gap-3">
      <div>
        <h2 class="text-xl sm:text-2xl font-semibold tracking-tight">{{ t('alerts.title') }}</h2>
        <p class="text-xs text-muted mt-1">
          {{ t('alerts.subtitle') }}
        </p>
      </div>
    </div>

    <div
      v-if="permission !== 'granted'"
      class="surface px-4 py-3 flex items-start gap-3 text-sm"
    >
      <IconBell class="size-4 mt-0.5 text-[var(--tape-accent)] shrink-0" />
      <div class="flex-1">
        <p>
          {{
            permission === 'denied'
              ? t('alerts.permissionDenied')
              : t('alerts.permissionDefault')
          }}
        </p>
      </div>
      <button
        v-if="permission === 'default'"
        class="btn-primary h-8 px-3 text-xs"
        @click="requestPermission"
      >
        {{ t('alerts.enable') }}
      </button>
    </div>

    <article class="surface overflow-hidden">
      <div class="sm:hidden divide-y divide-[var(--tape-border)]">
        <div v-if="!ordered.length" class="px-4 py-10 text-center text-sm text-soft">
          {{ t('alerts.emptyMobile') }}
        </div>
        <article
          v-for="r in ordered"
          :key="r.id"
          class="p-4 space-y-3 active:bg-[var(--tape-surface-hover-bg)]"
          @click="openDetail(r.code)"
        >
          <header class="flex-between gap-3">
            <div class="min-w-0">
              <div class="font-semibold tracking-tight truncate">{{ r.symbol }}</div>
              <div class="text-[10px] text-soft tracking-wider uppercase truncate">{{ r.code }}</div>
            </div>
            <div class="text-mono text-sm shrink-0">
              {{ quotes.get(r.code)?.last.toFixed(2) ?? '--' }}
            </div>
          </header>
          <div class="text-mono text-xs text-muted break-words">{{ describeAlert(r) }}</div>
          <div class="flex-between gap-3" @click.stop>
            <span v-if="r.triggered" class="pill pill-up">
              <IconCheck class="size-3" />
              {{ t('alerts.triggered', { time: r.triggeredAt ? formatRelative(r.triggeredAt) : '' }) }}
            </span>
            <span v-else-if="!r.enabled" class="pill pill-flat">
              <IconBellOff class="size-3" />
              {{ t('alerts.paused') }}
            </span>
            <span v-else class="pill pill-flat">
              <IconBell class="size-3" />
              {{ t('alerts.armed') }}
            </span>
            <div class="flex items-center justify-end gap-1">
              <button
                v-if="r.triggered"
                class="size-10 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-accent)] hover:bg-[var(--tape-button-hover-bg)]"
                :title="t('alerts.reArm')"
                @click="alerts.reset(r.id)"
              >
                <IconRotateCcw class="size-4" />
              </button>
              <button
                v-else
                class="size-10 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]"
                :title="r.enabled ? t('alerts.pause') : t('alerts.resume')"
                @click="alerts.toggle(r.id)"
              >
                <component :is="r.enabled ? IconBellOff : IconBell" class="size-4" />
              </button>
              <button
                class="size-10 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-down)] hover:bg-[var(--tape-down-soft)]"
                :title="t('alerts.remove')"
                @click="alerts.remove(r.id)"
              >
                <IconTrash2 class="size-4" />
              </button>
            </div>
          </div>
        </article>
      </div>

      <div class="hidden sm:block overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-[10px] uppercase tracking-wider text-soft border-b border-[var(--tape-border)]">
            <th class="text-left font-medium px-4 py-2">{{ t('alerts.colSymbol') }}</th>
            <th class="text-left font-medium px-3 py-2">{{ t('alerts.colRule') }}</th>
            <th class="text-right font-medium px-3 py-2">{{ t('alerts.colLast') }}</th>
            <th class="text-left font-medium px-3 py-2">{{ t('alerts.colStatus') }}</th>
            <th class="text-right font-medium px-3 py-2 w-32"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!ordered.length">
            <td colspan="5" class="px-4 py-12 text-center text-sm text-soft">
              {{ t('alerts.emptyDesktop') }}
            </td>
          </tr>
          <tr
            v-for="r in ordered"
            :key="r.id"
            class="border-b border-[var(--tape-border)] last:border-b-0 hover:bg-[var(--tape-surface-hover-bg)] cursor-pointer transition-colors"
            @click="openDetail(r.code)"
          >
            <td class="px-4 py-3">
              <div class="font-semibold tracking-tight">{{ r.symbol }}</div>
              <div class="text-[10px] text-soft tracking-wider uppercase">{{ r.code }}</div>
            </td>
            <td class="px-3 py-3 text-mono">{{ describeAlert(r) }}</td>
            <td class="px-3 py-3 text-mono text-right">
              {{ quotes.get(r.code)?.last.toFixed(2) ?? '--' }}
            </td>
            <td class="px-3 py-3">
              <span v-if="r.triggered" class="pill pill-up">
                <IconCheck class="size-3" />
                Triggered {{ r.triggeredAt ? formatRelative(r.triggeredAt) : '' }}
              </span>
              <span v-else-if="!r.enabled" class="pill pill-flat">
                <IconBellOff class="size-3" />
                Paused
              </span>
              <span v-else class="pill pill-flat">
                <IconBell class="size-3" />
                Armed
              </span>
            </td>
            <td class="text-right px-3 py-3" @click.stop>
              <div class="flex items-center justify-end gap-1">
                <button
                  v-if="r.triggered"
                  class="size-7 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-accent)] hover:bg-[var(--tape-button-hover-bg)]"
                  title="Re-arm"
                  @click="alerts.reset(r.id)"
                >
                  <IconRotateCcw class="size-3.5" />
                </button>
                <button
                  v-else
                  class="size-7 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]"
                  :title="r.enabled ? 'Pause' : 'Resume'"
                  @click="alerts.toggle(r.id)"
                >
                  <component :is="r.enabled ? IconBellOff : IconBell" class="size-3.5" />
                </button>
                <button
                  class="size-7 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-down)] hover:bg-[var(--tape-down-soft)]"
                  title="Remove"
                  @click="alerts.remove(r.id)"
                >
                  <IconTrash2 class="size-3.5" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </article>

    <p class="text-[10px] text-soft">
      {{ t('alerts.legend', { above: TYPE_LABEL.priceAbove, below: TYPE_LABEL.priceBelow, upBy: TYPE_LABEL.changePctUp, downBy: TYPE_LABEL.changePctDown }) }}
    </p>
  </div>
</template>
