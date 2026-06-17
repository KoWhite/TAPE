<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsCategories from './components/SettingsCategories.vue'
import SettingsDatabase from './components/SettingsDatabase.vue'
import SettingsDataSource from './components/SettingsDataSource.vue'
import SettingsDisplay from './components/SettingsDisplay.vue'

const { t } = useI18n()
</script>

<template>
  <div class="space-y-8 max-w-4xl">
    <header>
      <h2 class="text-xl sm:text-2xl font-semibold tracking-tight">{{ t('settings.title') }}</h2>
      <p class="text-sm text-muted mt-1">
        {{ t('settings.subtitle') }}
      </p>
    </header>

    <SettingsCategories />
    <SettingsDataSource />
    <SettingsDatabase />
    <SettingsDisplay />
  </div>
</template>
