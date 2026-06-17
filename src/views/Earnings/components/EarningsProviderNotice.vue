<script setup lang="ts">
import IconCalendarOff from '~icons/lucide/calendar-off'
</script>

<template>
  <div class="surface px-4 py-3 text-sm flex items-start gap-3">
    <IconCalendarOff class="size-4 mt-0.5 text-soft shrink-0" />
    <p class="text-muted">
      <i18n-t keypath="earnings.providerUnavailable" tag="span">
        <template #pkg>
          <code class="text-mono">yfinance</code>
        </template>
      </i18n-t>
    </p>
  </div>
</template>
