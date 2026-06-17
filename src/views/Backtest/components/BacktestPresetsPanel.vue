<script setup lang="ts">
import IconPlay from '~icons/lucide/play'
import IconSave from '~icons/lucide/save'
import IconTrash2 from '~icons/lucide/trash-2'
import type { BacktestPreset } from '@/stores/backtestPresets'

defineProps<{ presets: BacktestPreset[] }>()

const emit = defineEmits<{
  (e: 'save', name: string): void
  (e: 'apply', preset: BacktestPreset): void
  (e: 'delete', id: string): void
}>()

const name = ref('')
const pendingDeleteId = ref<string | null>(null)

function save(): void {
  emit('save', name.value)
  name.value = ''
}

function requestDelete(id: string): void {
  if (pendingDeleteId.value === id) {
    emit('delete', id)
    pendingDeleteId.value = null
    return
  }
  pendingDeleteId.value = id
}
</script>

<template>
  <article class="surface p-4 sm:p-5 space-y-4">
    <header class="flex-between gap-3 flex-wrap">
      <div>
        <h3 class="text-sm font-semibold tracking-tight">Presets</h3>
        <p class="text-[11px] text-muted mt-0.5">
          Save strategy setups locally for quick reuse.
        </p>
      </div>
      <div class="flex w-full sm:w-auto items-center gap-2">
        <input
          v-model="name"
          placeholder="Preset name"
          class="h-9 sm:h-8 min-w-0 flex-1 sm:w-40 px-3 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] text-xs focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none"
          @keydown.enter="save"
        />
        <button class="btn-primary h-9 sm:h-8 px-3 text-xs shrink-0" @click="save">
          <IconSave class="size-3.5" />
          Save
        </button>
      </div>
    </header>

    <div v-if="presets.length" class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="preset in presets"
        :key="preset.id"
        class="rounded-lg border border-[var(--tape-border)] bg-[var(--tape-surface-bg)] px-3 py-2.5 flex items-center gap-3"
      >
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium truncate">{{ preset.name }}</div>
          <div class="text-[10px] text-soft text-mono truncate">
            {{ preset.request.strategyId }} - {{ preset.request.universe?.[0] ?? '--' }}
          </div>
        </div>
        <button
          class="size-9 sm:size-7 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-accent)] hover:bg-[var(--tape-button-hover-bg)]"
          title="Load preset"
          @click="emit('apply', preset)"
        >
          <IconPlay class="size-3.5" />
        </button>
        <button
          class="h-9 sm:h-7 rounded-lg flex-center px-2 text-xs"
          :class="pendingDeleteId === preset.id ? 'bg-[var(--tape-down-soft)] text-[var(--tape-down)]' : 'bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-down)] hover:bg-[var(--tape-down-soft)]'"
          :title="pendingDeleteId === preset.id ? 'Confirm delete preset' : 'Delete preset'"
          @click="requestDelete(preset.id)"
        >
          <template v-if="pendingDeleteId === preset.id">Delete</template>
          <IconTrash2 v-else class="size-3.5" />
        </button>
      </div>
    </div>

    <p v-else class="text-xs text-soft">
      No presets yet. Configure a strategy, then save it here.
    </p>
  </article>
</template>
