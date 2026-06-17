<script setup lang="ts">
import { ref } from 'vue'
import { CATEGORY_COLORS, useWatchlistStore } from '@/stores/watchlist'

const watchlist = useWatchlistStore()

const newCategoryName = ref('')
const editingCategoryId = ref<string | null>(null)
const editingCategoryName = ref('')

function addCategoryFromInput(): void {
  const name = newCategoryName.value.trim()
  if (!name) return
  watchlist.addCategory(name)
  newCategoryName.value = ''
}

function startRenameCategory(id: string, current: string): void {
  editingCategoryId.value = id
  editingCategoryName.value = current
}

function commitRenameCategory(): void {
  if (!editingCategoryId.value) return
  watchlist.renameCategory(editingCategoryId.value, editingCategoryName.value)
  editingCategoryId.value = null
  editingCategoryName.value = ''
}

function cancelRenameCategory(): void {
  editingCategoryId.value = null
  editingCategoryName.value = ''
}

function confirmRemoveCategory(id: string, name: string): void {
  if (window.confirm(`Remove category "${name}"? Its tickers stay on the watchlist but become uncategorized.`)) {
    watchlist.removeCategory(id)
  }
}
</script>

<template>
  <section class="surface p-5 sm:p-6 space-y-4">
    <header>
      <h3 class="font-semibold tracking-tight flex items-center gap-2">
        <IconLucideTag class="size-4 text-[var(--tape-accent)]" />
        Categories
      </h3>
      <p class="text-xs text-muted mt-0.5">
        Group your watchlist however you want -sectors, themes, conviction tiers.
        Tickers with no category fall under "Uncategorized".
      </p>
    </header>

    <div class="flex gap-2">
      <input
        v-model="newCategoryName"
        class="input-base flex-1"
        placeholder="New category name -e.g. AI, Energy, Conviction A"
        maxlength="32"
        @keydown.enter="addCategoryFromInput"
      />
      <button class="btn-primary" :disabled="!newCategoryName.trim()" @click="addCategoryFromInput">
        <IconLucidePlus class="size-4" />
        Add
      </button>
    </div>

    <ul
      v-if="watchlist.categories.length"
      class="divide-y divide-[var(--tape-border)] border border-[var(--tape-border)] rounded-xl overflow-hidden"
    >
      <li
        v-for="cat in watchlist.categories"
        :key="cat.id"
        class="flex-between gap-3 px-4 py-2.5 hover:bg-[var(--tape-surface-hover-bg)] transition-colors"
      >
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <span
            class="size-3 rounded-full shrink-0 ring-2 ring-[var(--tape-bg-elev)]"
            :style="{ backgroundColor: cat.color }"
          />
          <input
            v-if="editingCategoryId === cat.id"
            v-model="editingCategoryName"
            class="input-base h-8"
            maxlength="32"
            autofocus
            @keydown.enter="commitRenameCategory"
            @keydown.escape="cancelRenameCategory"
            @blur="commitRenameCategory"
          />
          <div v-else class="min-w-0 flex-1">
            <div class="text-sm font-medium truncate">{{ cat.name }}</div>
            <div class="text-[10px] text-soft uppercase tracking-wider">
              {{ watchlist.countsByCategory.get(cat.id) ?? 0 }} symbol{{ (watchlist.countsByCategory.get(cat.id) ?? 0) === 1 ? '' : 's' }}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <div class="flex items-center gap-1">
            <button
              v-for="col in CATEGORY_COLORS"
              :key="col"
              type="button"
              class="size-4 rounded-full border border-[var(--tape-border)] transition-transform hover:scale-125"
              :class="cat.color === col && 'ring-2 ring-offset-1 ring-offset-[var(--tape-bg-elev)] ring-[var(--tape-text)]'"
              :style="{ backgroundColor: col }"
              :title="col"
              @click="watchlist.setCategoryColor(cat.id, col)"
            />
          </div>
          <button
            class="size-8 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)] transition-colors"
            :title="`Rename ${cat.name}`"
            @click="startRenameCategory(cat.id, cat.name)"
          >
            <IconLucidePencil class="size-3.5" />
          </button>
          <button
            class="size-8 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-down)] hover:bg-[var(--tape-down-soft)] transition-colors"
            :title="`Remove ${cat.name}`"
            @click="confirmRemoveCategory(cat.id, cat.name)"
          >
            <IconLucideTrash2 class="size-3.5" />
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="text-xs text-soft">
      No categories yet -add one above to start organizing your watchlist.
    </p>
  </section>
</template>
