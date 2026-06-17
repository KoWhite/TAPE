import { onMounted, onUnmounted, ref, computed } from 'vue'

const BP = {
  xs: 420,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const

export type Breakpoint = keyof typeof BP

/**
 * Reactive viewport width + helpers. SSR-safe (returns 0 until mounted).
 */
export function useBreakpoint() {
  const width = ref(typeof window === 'undefined' ? 0 : window.innerWidth)

  function onResize() {
    width.value = window.innerWidth
  }

  onMounted(() => {
    window.addEventListener('resize', onResize, { passive: true })
    onResize()
  })
  onUnmounted(() => {
    window.removeEventListener('resize', onResize)
  })

  const isMobile = computed(() => width.value < BP.md)
  const isTablet = computed(() => width.value >= BP.md && width.value < BP.lg)
  const isDesktop = computed(() => width.value >= BP.lg)

  function gte(bp: Breakpoint): boolean {
    return width.value >= BP[bp]
  }

  return { width, isMobile, isTablet, isDesktop, gte }
}
