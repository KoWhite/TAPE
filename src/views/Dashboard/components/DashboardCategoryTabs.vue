<script setup lang="ts">
interface CategoryTab {
  id: string | null
  name: string
  color?: string
  count: number
}

defineProps<{
  tabs: CategoryTab[]
  activeCategory: string | null
}>()

const emit = defineEmits<{
  select: [id: string | null]
}>()
</script>

<template>
  <div
    v-if="tabs.length > 1"
    class="flex flex-wrap items-center gap-1.5 -mb-1"
  >
    <button
      v-for="tab in tabs"
      :key="tab.id ?? '__all__'"
      class="pill border transition-colors bg-[var(--tape-button-bg)]"
      :class="
        activeCategory === tab.id
          ? 'border-[var(--tape-accent)] text-[var(--tape-text)] bg-[var(--tape-button-hover-bg)]'
          : 'border-[var(--tape-border)] text-muted hover:text-[var(--tape-text)]'
      "
      @click="emit('select', tab.id)"
    >
      <span
        v-if="tab.color"
        class="size-2 rounded-full shrink-0"
        :style="{ backgroundColor: tab.color }"
      />
      {{ tab.name }}
      <span class="text-soft text-[10px] tabular-nums ml-0.5">{{ tab.count }}</span>
    </button>
  </div>
</template>
