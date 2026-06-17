import {
  defineConfig,
  presetWind,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'
import presetAnimations from 'unocss-preset-animations'
import { presetShadcnV3 } from 'unocss-preset-shadcn/v3'

const tapeShadcnTheme = {
  base: 'neutral',
  name: 'tape',
  light: {
    background: '220 23% 97%',
    foreground: '220 35% 7%',
    card: '0 0% 100%',
    'card-foreground': '220 35% 7%',
    popover: '0 0% 100%',
    'popover-foreground': '220 35% 7%',
    primary: '161 100% 42%',
    'primary-foreground': '0 0% 0%',
    secondary: '222 24% 96%',
    'secondary-foreground': '220 35% 7%',
    muted: '222 24% 96%',
    'muted-foreground': '221 13% 34%',
    accent: '222 24% 96%',
    'accent-foreground': '220 35% 7%',
    destructive: '352 68% 52%',
    'destructive-foreground': '0 0% 100%',
    border: '225 18% 92%',
    input: '225 18% 92%',
    ring: '161 100% 42%',
    'chart-1': '161 100% 42%',
    'chart-2': '213 70% 48%',
    'chart-3': '38 82% 48%',
    'chart-4': '271 62% 56%',
    'chart-5': '352 68% 52%',
    sidebar: '0 0% 100%',
    'sidebar-foreground': '220 35% 7%',
    'sidebar-primary': '161 100% 42%',
    'sidebar-primary-foreground': '0 0% 0%',
    'sidebar-accent': '222 24% 96%',
    'sidebar-accent-foreground': '220 35% 7%',
    'sidebar-border': '225 18% 92%',
    'sidebar-ring': '161 100% 42%',
  },
  dark: {
    background: '220 35% 7%',
    foreground: '225 20% 93%',
    card: '222 29% 9%',
    'card-foreground': '225 20% 93%',
    popover: '222 29% 9%',
    'popover-foreground': '225 20% 93%',
    primary: '158 100% 50%',
    'primary-foreground': '0 0% 0%',
    secondary: '220 20% 15%',
    'secondary-foreground': '225 20% 93%',
    muted: '220 20% 15%',
    'muted-foreground': '222 13% 69%',
    accent: '220 20% 15%',
    'accent-foreground': '225 20% 93%',
    destructive: '0 91% 71%',
    'destructive-foreground': '220 35% 7%',
    border: '220 10% 22%',
    input: '222 39% 9%',
    ring: '158 100% 50%',
    'chart-1': '158 100% 50%',
    'chart-2': '213 76% 58%',
    'chart-3': '43 96% 56%',
    'chart-4': '271 74% 70%',
    'chart-5': '0 91% 71%',
    sidebar: '222 29% 9%',
    'sidebar-foreground': '225 20% 93%',
    'sidebar-primary': '158 100% 50%',
    'sidebar-primary-foreground': '0 0% 0%',
    'sidebar-accent': '220 20% 15%',
    'sidebar-accent-foreground': '225 20% 93%',
    'sidebar-border': '220 10% 22%',
    'sidebar-ring': '158 100% 50%',
  },
} as const

export default defineConfig({
  content: {
    pipeline: {
      include: [
        /\.(vue|svelte|[jt]sx?|md|html)($|\?)/,
        'src/**/*.{js,ts,vue}',
      ],
    },
  },
  shortcuts: [
    // Layout
    ['flex-center', 'flex items-center justify-center'],
    ['flex-between', 'flex items-center justify-between'],
    ['col-center', 'flex flex-col items-center justify-center'],

    // Surface tokens: trader-terminal aesthetic
    [
      'surface',
      'bg-[var(--tape-surface)] border border-[var(--tape-border)] rounded-lg',
    ],
    [
      'surface-hover',
      'transition-colors duration-200 hover:border-[var(--tape-border-hover)]',
    ],
    [
      'glass',
      'bg-[var(--tape-glass)] backdrop-blur-xl border border-[var(--tape-border)]',
    ],

    // Text
    ['text-mono', 'font-mono tabular-nums tracking-tight'],
    ['text-muted', 'text-[var(--tape-text-muted)]'],
    ['text-soft', 'text-[var(--tape-text-soft)]'],

    // Buttons
    [
      'btn',
      'inline-flex items-center justify-center gap-2 px-4 h-10 rounded-xl text-sm font-medium transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none',
    ],
    [
      'btn-primary',
      'btn bg-[var(--tape-accent)] text-black hover:bg-[var(--tape-accent-hover)]',
    ],
    [
      'btn-ghost',
      'btn text-[var(--tape-text)] bg-[var(--tape-button-bg)] hover:bg-[var(--tape-button-hover-bg)]',
    ],
    [
      'btn-outline',
      'btn border border-[var(--tape-border)] bg-[var(--tape-button-bg)] text-[var(--tape-text)] hover:border-[var(--tape-border-hover)] hover:bg-[var(--tape-button-hover-bg)]',
    ],

    // Inputs
    [
      'input-base',
      'h-10 w-full rounded-xl bg-[var(--tape-input)] border border-[var(--tape-border)] px-3.5 text-sm text-[var(--tape-text)] placeholder:text-[var(--tape-text-soft)] outline-none transition-colors focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)]',
    ],

    // Pills
    [
      'pill',
      'inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full text-[11px] font-medium tracking-wide',
    ],
    ['pill-up', 'pill bg-[var(--tape-up-soft)] text-[var(--tape-up)]'],
    ['pill-down', 'pill bg-[var(--tape-down-soft)] text-[var(--tape-down)]'],
    ['pill-flat', 'pill bg-[var(--tape-surface-hover-bg)] text-[var(--tape-text-soft)]'],
  ],
  theme: {
    fontFamily: {
      sans: 'var(--tape-font-sans)',
      mono: 'var(--tape-font-mono)',
    },
    breakpoints: {
      xs: '420px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    animation: {
      keyframes: {
        'flash-up':
          '{0%{background-color:rgba(74,222,128,0.28)}100%{background-color:transparent}}',
        'flash-down':
          '{0%{background-color:rgba(248,113,113,0.28)}100%{background-color:transparent}}',
        shimmer: '{0%{background-position:-400px 0}100%{background-position:400px 0}}',
      },
      durations: {
        'flash-up': '700ms',
        'flash-down': '700ms',
        shimmer: '1.4s',
      },
      timingFns: {
        'flash-up': 'ease-out',
        'flash-down': 'ease-out',
        shimmer: 'linear',
      },
      counts: {
        shimmer: 'infinite',
      },
    },
  },
  presets: [
    presetWind({ dark: 'class' }),
    presetAnimations(),
    presetShadcnV3(
      { color: tapeShadcnTheme, radius: 0.5 },
      { componentLibrary: 'reka' },
    ),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  safelist: [
    'pill-up',
    'pill-down',
    'pill-flat',
    'animate-flash-up',
    'animate-flash-down',
  ],
})
