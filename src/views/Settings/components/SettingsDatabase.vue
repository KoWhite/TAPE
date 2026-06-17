<script setup lang="ts">
import IconDatabase from '~icons/lucide/database'
import IconDownload from '~icons/lucide/download'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import IconTrash2 from '~icons/lucide/trash-2'
import IconUpload from '~icons/lucide/upload'
import {
  clearServerCache,
  fetchAppState,
  saveAppState,
  type AppStatePatch,
  type AppStateResponse,
} from '@/api/appState'
import { persistCurrentAppState } from '@/composables/useDatabasePersistence'

const loading = ref(false)
const syncing = ref(false)
const restoring = ref(false)
const error = ref<string | null>(null)
const info = ref<AppStateResponse | null>(null)
const restoreText = ref('')

const sizeLabel = computed(() => {
  const bytes = info.value?.dbSizeBytes ?? 0
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
})

const lastWriteLabel = computed(() => {
  const raw = info.value?.lastUpdatedAt
  if (!raw) return '--'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
})

const backupJson = computed(() => {
  if (!info.value) return ''
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      state: info.value.state,
    },
    null,
    2,
  )
})

async function refresh(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    info.value = await fetchAppState()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function syncCurrent(): Promise<void> {
  syncing.value = true
  error.value = null
  try {
    info.value = await persistCurrentAppState()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    syncing.value = false
  }
}

function downloadBackup(): void {
  if (!backupJson.value) return
  const blob = new Blob([backupJson.value], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tape-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function restoreBackup(): Promise<void> {
  if (!restoreText.value.trim()) return
  restoring.value = true
  error.value = null
  try {
    const parsed = JSON.parse(restoreText.value) as { state?: AppStatePatch }
    if (!parsed.state || typeof parsed.state !== 'object') {
      throw new Error('Backup JSON must contain a state object.')
    }
    info.value = await saveAppState(parsed.state, { replace: true })
    restoreText.value = ''
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    restoring.value = false
  }
}

const lastCacheClear = ref<string | null>(null)

async function clearCaches(): Promise<void> {
  if (!window.confirm('Clear persisted market caches from SQLite? Personal data stays.')) return
  const emptyCaches: AppStatePatch = {
    earnings: { snapshots: {} },
    macro: { cache: {} },
    fearGreed: { data: null, fetchedAt: null },
    polymarket: { data: null, fetchedAt: null },
    sectors: { cache: {} },
    aiDailyBrief: { briefs: {} },
  }
  loading.value = true
  error.value = null
  lastCacheClear.value = null
  try {
    // Two stores to wipe: the bridge-side cache_entries table (bars,
    // indicator results) and the app_state mirrors of client caches.
    const serverResult = await clearServerCache()
    info.value = await saveAppState(emptyCaches)
    lastCacheClear.value = `Cleared ${serverResult.removed} bridge cache row${serverResult.removed === 1 ? '' : 's'} + client mirrors.`
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await refresh()
  if (!info.value?.stateKeys?.length) {
    await syncCurrent()
  }
})
</script>

<template>
  <section class="surface p-5 sm:p-6 space-y-4">
    <header class="flex-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <IconDatabase class="size-4 text-[var(--tape-accent)]" />
        <div>
          <h3 class="font-semibold tracking-tight">Database</h3>
          <p class="text-xs text-muted mt-0.5">
            SQLite state, backup, and cache maintenance.
          </p>
        </div>
      </div>
      <button class="btn-outline h-8 px-3 text-xs" :disabled="loading" @click="refresh">
        <IconRefreshCw class="size-3.5" :class="loading && 'animate-pulse opacity-80'" />
        Refresh
      </button>
    </header>

    <p v-if="error" class="text-xs text-[var(--tape-down)]">{{ error }}</p>
    <p v-else-if="lastCacheClear" class="text-xs text-muted">{{ lastCacheClear }}</p>

    <dl class="grid sm:grid-cols-2 gap-3 text-xs">
      <div>
        <dt class="text-soft uppercase tracking-wider text-[10px]">Path</dt>
        <dd class="text-mono mt-1 break-all">{{ info?.dbPath || '--' }}</dd>
      </div>
      <div>
        <dt class="text-soft uppercase tracking-wider text-[10px]">Size</dt>
        <dd class="text-mono mt-1">{{ sizeLabel }}</dd>
      </div>
      <div>
        <dt class="text-soft uppercase tracking-wider text-[10px]">Last write</dt>
        <dd class="text-mono mt-1" :title="info?.lastUpdatedAt || ''">
          {{ lastWriteLabel }}
        </dd>
      </div>
      <div>
        <dt class="text-soft uppercase tracking-wider text-[10px]">State keys</dt>
        <dd class="mt-1 flex flex-wrap gap-1">
          <span
            v-for="key in info?.stateKeys ?? []"
            :key="key"
            class="pill-flat text-[10px]"
          >
            {{ key }}
          </span>
          <span v-if="!info?.stateKeys?.length" class="text-soft">--</span>
        </dd>
      </div>
    </dl>

    <div class="flex gap-2 flex-wrap">
      <button class="btn-primary h-8 px-3 text-xs" :disabled="!info" @click="downloadBackup">
        <IconDownload class="size-3.5" />
        Export backup
      </button>
      <button class="btn-outline h-8 px-3 text-xs" :disabled="syncing" @click="syncCurrent">
        <IconRefreshCw class="size-3.5" :class="syncing && 'animate-pulse opacity-80'" />
        Sync current data
      </button>
      <button class="btn-outline h-8 px-3 text-xs" :disabled="loading" @click="clearCaches">
        <IconTrash2 class="size-3.5" />
        Clear caches
      </button>
    </div>

    <div class="pt-3 border-t border-[var(--tape-border)] space-y-2">
      <label class="block">
        <span class="text-[10px] uppercase tracking-wider text-soft">Restore backup JSON</span>
        <textarea
          v-model="restoreText"
          rows="4"
          class="mt-1 w-full px-3 py-2 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] text-mono text-xs focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none"
          placeholder="{ &quot;version&quot;: 1, &quot;state&quot;: { ... } }"
        />
      </label>
      <button class="btn-outline h-8 px-3 text-xs" :disabled="restoring || !restoreText.trim()" @click="restoreBackup">
        <IconUpload class="size-3.5" />
        Restore
      </button>
    </div>
  </section>
</template>
