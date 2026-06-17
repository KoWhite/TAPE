<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const navItems = router
  .getRoutes()
  .filter((r) => r.meta?.icon && r.name !== 'not-found')
  .map((r) => ({
    name: r.name as string,
    path: r.path,
    label: (r.meta?.title as string) ?? (r.name as string),
    icon: r.meta?.icon,
  }))
</script>

<template>
  <nav
    class="fixed bottom-0 inset-x-0 z-40 glass border-t border-[var(--tape-border)] pb-[env(safe-area-inset-bottom)]"
  >
    <ul class="flex h-16">
      <li v-for="item in navItems" :key="item.name" class="flex-1">
        <RouterLink
          :to="item.path"
          custom
          v-slot="{ isActive, navigate }"
        >
          <button
            class="w-full h-full flex flex-col items-center justify-center gap-1 transition-colors"
            :class="
              isActive
                ? 'text-[var(--tape-accent)]'
                : 'text-soft hover:text-[var(--tape-text)]'
            "
            @click="navigate"
          >
            <component
              :is="item.icon"
              class="size-5 transition-transform"
              :class="isActive ? 'scale-110' : ''"
            />
            <span class="text-[10px] font-medium tracking-wide">
              {{ item.label }}
            </span>
          </button>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
