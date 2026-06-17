<script setup lang="ts">
import IconTriangleAlert from '~icons/lucide/triangle-alert'

defineProps<{ error: string }>()
</script>

<template>
  <div class="surface px-4 py-3 flex items-start gap-3 text-sm border-[var(--tape-down-soft)]">
    <IconTriangleAlert class="size-4 mt-0.5 text-[var(--tape-down)] shrink-0" />
    <p class="text-[var(--tape-down)]">{{ error }}</p>
  </div>
</template>
