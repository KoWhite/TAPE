<script setup lang="ts">
defineProps<{ error: string }>()

const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div
    class="surface px-4 py-3 flex items-start gap-3 text-sm border-[var(--tape-down-soft)]"
  >
    <IconLucideTriangleAlert class="size-4 mt-0.5 text-[var(--tape-down)] shrink-0" />
    <div class="flex-1 min-w-0">
      <div class="text-[var(--tape-down)] break-words">{{ error }}</div>
      <div class="text-[11px] text-soft mt-0.5">
        Check the bridge, symbol code, and date range, then retry.
      </div>
    </div>
    <button class="btn-ghost h-7 px-2 text-xs shrink-0" @click="emit('retry')">
      Retry
    </button>
  </div>
</template>
