<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
// import GlobalTicker from '@/components/ticker/GlobalTicker.vue'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useDatabasePersistence } from '@/composables/useDatabasePersistence'
import { useTheme } from '@/composables/useTheme'
import { useLanguage } from '@/composables/useLanguage'

const { isDesktop } = useBreakpoint()
useDatabasePersistence()
useTheme()
useLanguage()

const drawerOpen = ref(false)
const route = useRoute()

watch(() => route.fullPath, () => {
  drawerOpen.value = false
})
watch(isDesktop, (v) => {
  if (v) drawerOpen.value = false
})
</script>

<template>
  <div class="min-h-screen w-full flex bg-[var(--tape-bg)] text-[var(--tape-text)]">
    <AppSidebar v-if="isDesktop" class="shrink-0" />

    <div class="flex-1 flex flex-col min-w-0">
      <AppHeader @toggle-menu="drawerOpen = !drawerOpen" />
      <!-- <GlobalTicker /> -->

      <main
        class="flex-1 overflow-x-hidden px-3 sm:px-6 lg:px-8 pb-8 lg:pb-10 pt-3 lg:pt-6"
      >
        <div class="mx-auto max-w-screen-2xl w-full">
          <slot />
        </div>
      </main>
    </div>

    <Teleport to="body">
      <Transition name="drawer-backdrop">
        <div
          v-if="drawerOpen && !isDesktop"
          class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          aria-hidden="true"
          @click="drawerOpen = false"
        />
      </Transition>
      <Transition name="drawer">
        <AppSidebar
          v-if="drawerOpen && !isDesktop"
          drawer
          @close="drawerOpen = false"
        />
      </Transition>
    </Teleport>
  </div>
</template>

<style>
.drawer-backdrop-enter-active,
.drawer-backdrop-leave-active {
  transition: opacity 200ms ease;
}
.drawer-backdrop-enter-from,
.drawer-backdrop-leave-to {
  opacity: 0;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(-100%);
}
</style>
