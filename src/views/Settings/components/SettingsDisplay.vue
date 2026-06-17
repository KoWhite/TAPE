<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/settings'
import { SUPPORTED_LOCALES } from '@/i18n'

const { t } = useI18n()
const settings = useSettingsStore()
</script>

<template>
  <section class="surface p-5 sm:p-6 space-y-5">
    <header>
      <h3 class="font-semibold tracking-tight flex items-center gap-2">
        <IconLucidePalette class="size-4 text-[var(--tape-accent)]" />
        {{ t('settings.display.title') }}
      </h3>
    </header>

    <div class="grid gap-4 sm:grid-cols-2">
      <label class="block">
        <span class="text-xs text-muted block mb-1.5">{{ t('settings.display.theme') }}</span>
        <select v-model="settings.theme" class="input-base">
          <option value="dark">{{ t('settings.display.themeDark') }}</option>
          <option value="light">{{ t('settings.display.themeLight') }}</option>
          <option value="system">{{ t('settings.display.themeSystem') }}</option>
        </select>
      </label>

      <label class="block">
        <span class="text-xs text-muted block mb-1.5">{{ t('settings.display.language') }}</span>
        <select v-model="settings.language" class="input-base">
          <option v-for="loc in SUPPORTED_LOCALES" :key="loc" :value="loc">
            {{ t(`common.language.${loc}`) }}
          </option>
        </select>
      </label>

      <label class="block">
        <span class="text-xs text-muted block mb-1.5">{{ t('settings.display.density') }}</span>
        <select v-model="settings.density" class="input-base">
          <option value="comfortable">{{ t('settings.display.densityComfortable') }}</option>
          <option value="compact">{{ t('settings.display.densityCompact') }}</option>
        </select>
      </label>

      <label class="flex items-start gap-3 cursor-pointer">
        <input
          v-model="settings.flashOnTick"
          type="checkbox"
          class="mt-1 size-4 rounded border-[var(--tape-border)] accent-[var(--tape-accent)]"
        />
        <span class="text-sm">
          {{ t('settings.display.flashOnTick') }}
          <span class="block text-xs text-muted mt-0.5">
            {{ t('settings.display.flashOnTickHint') }}
          </span>
        </span>
      </label>

      <label class="flex items-start gap-3 cursor-pointer">
        <input
          v-model="settings.showAfterHours"
          type="checkbox"
          class="mt-1 size-4 rounded border-[var(--tape-border)] accent-[var(--tape-accent)]"
        />
        <span class="text-sm">
          {{ t('settings.display.showAfterHours') }}
          <span class="block text-xs text-muted mt-0.5">
            {{ t('settings.display.showAfterHoursHint') }}
          </span>
        </span>
      </label>
    </div>

    <div class="flex justify-end pt-2">
      <button class="btn-ghost text-xs" @click="settings.reset()">
        <IconLucideRotateCcw class="size-3.5" />
        {{ t('settings.display.reset') }}
      </button>
    </div>
  </section>
</template>
