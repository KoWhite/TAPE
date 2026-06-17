<script setup lang="ts">
import IconX from '~icons/lucide/x'
import IndicatorPicker from './IndicatorPicker.vue'

defineProps<{ selected: string[] }>()

defineEmits<{
  (e: 'close'): void
  (e: 'select', id: string): void
}>()
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 px-3 sm:px-4 py-4 sm:py-0 overflow-y-auto"
    @click.self="$emit('close')"
  >
    <article class="surface w-full max-w-2xl p-4 sm:p-6 space-y-4 max-h-[calc(100vh-2rem)] sm:max-h-[85vh] flex flex-col">
      <header class="flex-between gap-3">
        <h3 class="text-base font-semibold">Add indicator</h3>
        <button
          class="size-10 sm:size-8 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]"
          @click="$emit('close')"
        >
          <IconX class="size-4" />
        </button>
      </header>
      <div class="flex-1 min-h-0 overflow-hidden">
        <IndicatorPicker :selected="selected" @select="$emit('select', $event)" />
      </div>
    </article>
  </div>
</template>
