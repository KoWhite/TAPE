import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import type { Component } from 'vue'
import { i18n } from '@/i18n'
import IconLineChart from '~icons/lucide/line-chart'
import IconFlame from '~icons/lucide/flame'
import IconLandmark from '~icons/lucide/landmark'
import IconSettings2 from '~icons/lucide/settings-2'
import IconWallet from '~icons/lucide/wallet'
import IconBell from '~icons/lucide/bell'
import IconGitCompare from '~icons/lucide/git-compare'
import IconCalendarClock from '~icons/lucide/calendar-clock'
import IconLayoutDashboard from '~icons/lucide/layout-dashboard'
import IconLayoutGrid from '~icons/lucide/layout-grid'
import IconBeaker from '~icons/lucide/beaker'
import IconLineChart2 from '~icons/lucide/line-chart'
import IconSparkles from '~icons/lucide/sparkles'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    icon?: Component
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'overview',
    component: () => import('@/views/Overview/index.vue'),
    meta: { title: 'Overview', icon: IconLayoutDashboard },
  },
  {
    path: '/watchlist',
    name: 'watchlist',
    component: () => import('@/views/Dashboard/index.vue'),
    meta: { title: 'Watchlist', icon: IconLineChart },
  },
  {
    path: '/movers',
    name: 'movers',
    component: () => import('@/views/Movers/index.vue'),
    meta: { title: 'Movers', icon: IconFlame },
  },
  {
    path: '/heatmap',
    name: 'heatmap',
    component: () => import('@/views/Heatmap/index.vue'),
    meta: { title: 'Heatmap', icon: IconLayoutGrid },
  },
  {
    path: '/indicators',
    name: 'indicators',
    component: () => import('@/views/IndicatorLab/index.vue'),
    meta: { title: 'Indicator Lab', icon: IconBeaker },
  },
  {
    path: '/backtest',
    name: 'backtest',
    component: () => import('@/views/Backtest/index.vue'),
    meta: { title: 'Backtest', icon: IconLineChart2 },
  },
  {
    path: '/screener',
    name: 'screener',
    component: () => import('@/views/Screener/index.vue'),
    meta: { title: 'Screener', icon: IconSparkles },
  },
  {
    path: '/compare',
    name: 'compare',
    component: () => import('@/views/Compare/index.vue'),
    meta: { title: 'Compare', icon: IconGitCompare },
  },
  {
    path: '/portfolio',
    name: 'portfolio',
    component: () => import('@/views/Portfolio/index.vue'),
    meta: { title: 'Portfolio', icon: IconWallet },
  },
  {
    path: '/alerts',
    name: 'alerts',
    component: () => import('@/views/Alerts/index.vue'),
    meta: { title: 'Alerts', icon: IconBell },
  },
  {
    path: '/earnings',
    name: 'earnings',
    component: () => import('@/views/Earnings/index.vue'),
    meta: { title: 'Earnings', icon: IconCalendarClock },
  },
  {
    path: '/macro',
    name: 'macro',
    component: () => import('@/views/Macro/index.vue'),
    meta: { title: 'Macro', icon: IconLandmark },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/Settings/index.vue'),
    meta: { title: 'Settings', icon: IconSettings2 },
  },
  {
    path: '/stock/:code',
    name: 'stock-detail',
    component: () => import('@/views/StockDetail/index.vue'),
    meta: { title: 'Detail' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFound/index.vue'),
    meta: { title: 'Not Found' },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  // Localize the document title from the route name (e.g. `routes.overview`).
  // Falls back to the static English meta.title, then the brand name.
  const name = to.name as string | undefined
  const key = name ? `routes.${name}` : ''
  const t = i18n.global.t
  const localized = key && i18n.global.te(key) ? t(key) : undefined
  const title = localized || (to.meta?.title as string) || 'Tape'
  document.title = `${title} · Tape`
})

export default router
