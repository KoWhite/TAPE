<script setup lang="ts">
import { computed } from 'vue'
import IconExternalLink from '~icons/lucide/external-link'
import IconNewspaper from '~icons/lucide/newspaper'
import IconVideo from '~icons/lucide/video'
import { formatRelative } from '@/utils/format'
import type { NewsItem } from '@/types/news'

/**
 * Compact news list. Designed to slot into both the per-ticker detail view
 * and the Overview market card without changes -caller controls the
 * surrounding chrome.
 */

interface Props {
  items: NewsItem[]
  /** Cap how many entries to render. The store keeps up to 20; cards
   *  on the homepage usually want fewer to stay above the fold. */
  limit?: number
  /** Whether to render thumbnails. Detail page wants them; tight
   *  sidebars may not. */
  showThumbnails?: boolean
  /** Empty-state copy. Lets callers say "No news for AAPL" vs
   *  "No market news right now." */
  emptyLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  limit: 20,
  showThumbnails: true,
  emptyLabel: 'No news yet.',
})

const visible = computed(() => props.items.slice(0, props.limit))

function onImgError(e: Event): void {
  ;(e.target as HTMLImageElement).style.display = 'none'
}

function relativeOrEmpty(iso: string): string {
  if (!iso) return ''
  return formatRelative(iso)
}
</script>

<template>
  <div v-if="!visible.length" class="py-8 text-center text-sm text-soft">
    {{ emptyLabel }}
  </div>
  <ul v-else class="space-y-2">
    <li v-for="item in visible" :key="item.id">
      <a
        :href="item.url"
        target="_blank"
        rel="noopener"
        class="block rounded-xl border border-[var(--tape-border)] hover:border-[var(--tape-border-hover)] hover:bg-[var(--tape-surface-hover-bg)] transition-colors p-3 group"
      >
        <div class="flex gap-3 items-start">
          <!-- Thumbnail or icon fallback -->
          <template v-if="showThumbnails">
            <img
              v-if="item.thumbnail"
              :src="item.thumbnail"
              :alt="item.title"
              loading="lazy"
              class="size-14 sm:size-16 rounded-lg object-cover bg-[var(--tape-surface-hover-bg)] shrink-0"
              @error="onImgError"
            />
            <div
              v-else
              class="size-14 sm:size-16 rounded-lg bg-[var(--tape-surface-hover-bg)] flex-center text-soft shrink-0"
            >
              <component
                :is="item.type === 'VIDEO' ? IconVideo : IconNewspaper"
                class="size-5"
              />
            </div>
          </template>

          <!-- Body -->
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <p
                class="text-sm font-semibold tracking-tight leading-snug text-[var(--tape-text)]"
                style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden"
              >
                {{ item.title }}
              </p>
              <IconExternalLink
                class="size-3.5 text-soft opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
              />
            </div>
            <p
              v-if="item.summary"
              class="text-xs text-muted mt-1 leading-snug"
              style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden"
            >
              {{ item.summary }}
            </p>
            <div class="flex items-center gap-2 text-[10px] text-soft uppercase tracking-wider mt-1.5 flex-wrap">
              <span class="font-semibold">{{ item.provider }}</span>
              <span v-if="item.publishedAt" class="text-soft">·</span>
              <span v-if="item.publishedAt">{{ relativeOrEmpty(item.publishedAt) }}</span>
              <span
                v-if="item.type === 'VIDEO'"
                class="px-1.5 py-0.5 rounded bg-[var(--tape-accent)] text-[var(--tape-bg)] text-[9px] tracking-widest"
              >
                Video
              </span>
            </div>
          </div>
        </div>
      </a>
    </li>
  </ul>
</template>
