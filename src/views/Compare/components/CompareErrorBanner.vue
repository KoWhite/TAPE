<script setup lang="ts">
defineProps<{ errors: Map<string, string> }>()
</script>

<template>
  <div
    v-if="errors.size"
    class="surface px-4 py-3 flex items-start gap-3 text-sm border-[var(--tape-down-soft)]"
  >
    <IconLucideTriangleAlert class="size-4 mt-0.5 text-[var(--tape-down)] shrink-0" />
    <ul class="flex-1 space-y-0.5 text-[var(--tape-down)] text-xs">
      <li v-for="[code, msg] in errors" :key="code">
        <span class="text-mono font-semibold">{{ code }}</span> - {{ msg }}
      </li>
    </ul>
  </div>
</template>
