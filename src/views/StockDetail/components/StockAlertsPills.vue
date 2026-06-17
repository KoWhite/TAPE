<script setup lang="ts">
import IconBell from '~icons/lucide/bell'
import IconCheck from '~icons/lucide/check'
import IconX from '~icons/lucide/x'
import { describeAlert, type AlertRule } from '@/stores/alerts'

defineProps<{ alerts: AlertRule[] }>()
defineEmits<{ (e: 'remove', id: string): void }>()
</script>

<template>
  <div v-if="alerts.length" class="flex flex-wrap items-center gap-2">
    <span class="text-[10px] uppercase tracking-wider text-soft">Alerts</span>
    <span
      v-for="r in alerts"
      :key="r.id"
      class="pill"
      :class="r.triggered ? 'pill-up' : r.enabled ? 'pill-flat' : 'pill-flat opacity-60'"
    >
      <component :is="r.triggered ? IconCheck : IconBell" class="size-3" />
      {{ describeAlert(r) }}
      <button
        class="ml-1 size-3 flex-center text-soft hover:text-[var(--tape-down)]"
        title="Remove"
        @click="$emit('remove', r.id)"
      >
        <IconX class="size-3" />
      </button>
    </span>
  </div>
</template>
