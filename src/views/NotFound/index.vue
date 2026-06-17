<script setup lang="ts"></script>

<template>
  <div class="col-center min-h-[60vh] text-center px-6">
    <IconLucideSearchX class="size-12 text-soft mb-4" />
    <h2 class="text-2xl font-semibold tracking-tight">Page not found</h2>
    <p class="text-sm text-muted mt-2 max-w-sm">
      The route you tried doesn't exist. Head back to the dashboard.
    </p>
    <RouterLink to="/" class="btn-primary mt-6">
      <IconLucideArrowLeft class="size-4" />
      Back to Watchlist
    </RouterLink>
  </div>
</template>
