<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

defineProps<{ drawer?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const { t } = useI18n()

// `key` is the i18n group label key (nav.groups.*); `names` are route names.
const routeGroups = [
  {
    key: 'daily',
    names: ['overview', 'watchlist', 'movers', 'heatmap'],
  },
  {
    key: 'research',
    names: ['indicators', 'backtest', 'screener', 'compare', 'earnings', 'macro'],
  },
  {
    key: 'manage',
    names: ['portfolio', 'alerts', 'settings'],
  },
] as const

function groupAccent(key: string): 'accent' | 'info' {
  return key === 'research' ? 'info' : 'accent'
}

// Static route metadata (path + icon) is resolved once; the label is looked up
// reactively from i18n via `routes.<name>` so it re-renders on locale change.
const allNavItems = router
  .getRoutes()
  .filter((r) => r.meta?.icon && r.name !== 'not-found')
  .map((r) => ({
    name: r.name as string,
    path: r.path,
    icon: r.meta?.icon,
  }))

const navGroups = computed(() =>
  routeGroups
    .map((group) => ({
      key: group.key,
      label: t(`nav.groups.${group.key}`),
      items: group.names
        .map((name) => allNavItems.find((item) => item.name === name))
        .filter((item): item is (typeof allNavItems)[number] => Boolean(item))
        .map((item) => ({ ...item, label: t(`routes.${item.name}`) })),
    }))
    .filter((group) => group.items.length),
)
</script>

<template>
  <aside
    class="border-r border-[var(--tape-border)] bg-[var(--tape-bg-elev)] flex flex-col"
    :class="
      drawer
        ? 'fixed inset-y-0 left-0 z-50 w-[288px] max-w-[85vw] shadow-2xl'
        : 'sticky top-0 h-screen w-[224px] xl:w-[236px]'
    "
  >
    <div class="h-16 flex items-center gap-3 px-4 py-3 border-b border-[var(--tape-border)]">
      <div class="size-9 rounded-lg bg-[var(--tape-accent)] flex-center shadow-sm shadow-[rgba(0,214,146,0.18)]">
        <IconLucideActivity class="text-[var(--tape-bg)] size-4.5" />
      </div>
      <div class="flex flex-col leading-tight flex-1 min-w-0">
        <span class="font-semibold text-sm tracking-tight">{{ t('app.name') }}</span>
        <span class="text-[10px] text-soft uppercase tracking-wider">
          {{ t('app.tagline') }}
        </span>
      </div>
      <button
        v-if="drawer"
        class="size-8 rounded-lg flex-center bg-[var(--tape-button-bg)] text-muted hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)] transition-colors"
        :aria-label="t('nav.closeMenu')"
        @click="emit('close')"
      >
        <IconLucideX class="size-4" />
      </button>
    </div>

    <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-5">
      <section
        v-for="group in navGroups"
        :key="group.key"
        class="space-y-1.5"
      >
        <div class="px-3 text-[10px] uppercase tracking-[0.18em] text-soft">
          {{ group.label }}
        </div>
        <RouterLink
          v-for="item in group.items"
          :key="item.name"
          :to="item.path"
          custom
          v-slot="{ isActive, navigate }"
        >
          <button
            class="w-full flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-sm border transition-colors group"
            :class="
              isActive
                ? 'bg-[var(--tape-surface)] border-[var(--tape-border-hover)] text-[var(--tape-text)] font-medium'
                : 'bg-transparent border-transparent text-muted hover:bg-[var(--tape-button-bg)] hover:border-[var(--tape-border)] hover:text-[var(--tape-text)]'
            "
            @click="navigate"
          >
            <span
              class="size-6 rounded-md flex-center shrink-0 transition-colors"
              :class="
                isActive
                  ? groupAccent(group.key) === 'info'
                    ? 'bg-[var(--tape-info)] text-[var(--tape-bg)]'
                    : 'bg-[var(--tape-accent)] text-[var(--tape-bg)]'
                  : 'bg-[var(--tape-button-bg)] text-soft group-hover:text-[var(--tape-text)]'
              "
            >
              <component :is="item.icon" class="size-3.5" />
            </span>
            <span class="truncate">{{ item.label }}</span>
            <span
              v-if="isActive"
              class="ml-auto size-1.5 rounded-full"
              :class="groupAccent(group.key) === 'info' ? 'bg-[var(--tape-info)]' : 'bg-[var(--tape-accent)]'"
            />
          </button>
        </RouterLink>
      </section>
    </nav>

    <div class="px-4 py-4 border-t border-[var(--tape-border)] text-[10px] text-soft space-y-3">
      <div class="rounded-lg border border-[var(--tape-border)] bg-[var(--tape-button-bg)] px-3 py-2">
        <div class="flex items-center gap-2">
          <span class="size-1.5 rounded-full bg-[var(--tape-accent)]" />
          <span class="uppercase tracking-wider">{{ t('nav.localBridge') }}</span>
        </div>
        <div class="mt-1 text-[11px] text-muted">
          {{ t('nav.bridgeSubtitle') }}
        </div>
      </div>
      <div class="flex-between">
        <span class="uppercase tracking-wider">v0.1.0</span>
        <a
          href="https://www.futunn.com/download/openAPI"
          target="_blank"
          rel="noopener"
          class="hover:text-[var(--tape-text)] transition-colors flex items-center gap-1"
        >
          {{ t('nav.futuOpenApi') }}
          <IconLucideArrowUpRight class="size-3" />
        </a>
      </div>
    </div>
  </aside>
</template>
