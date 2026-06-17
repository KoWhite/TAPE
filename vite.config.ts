import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'

export default defineConfig({
  plugins: [
    vue(),
    UnoCSS(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      dts: 'src/auto-imports.d.ts',
      dirs: ['src/composables', 'src/stores'],
      vueTemplate: true,
    }),
    Components({
      dts: 'src/components.d.ts',
      dirs: ['src/components'],
      resolvers: [
        IconsResolver({
          prefix: 'Icon',
          enabledCollections: ['lucide', 'svg-spinners'],
        }),
      ],
    }),
    Icons({
      compiler: 'vue3',
      scale: 1.1,
      defaultClass: 'inline-block align-middle',
      autoInstall: true,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      // The Tape bridge (server-py/app.py) listens on :8787 and wraps the
      // Futu OpenD binary protocol with JSON HTTP. Run `python app.py`
      // from server-py/ to bring it up. OpenD itself does NOT serve HTTP
      // — do not point this at OpenD directly.
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split heavy chart libraries into their own chunks so the Overview
        // route (no charts) and Macro/StockDetail (different chart libs)
        // don't all share one fat vendor bundle. Each chart library only
        // loads on the route that actually uses it.
        manualChunks: {
          'vendor-echarts': ['echarts'],
          'vendor-highcharts': ['highcharts/highstock.src'],
          'vendor-lightweight-charts': ['lightweight-charts'],
        },
      },
    },
  },
})
